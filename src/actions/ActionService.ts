import type { PermissionManager } from "../permissions/PermissionManager.js";
import type { FileService } from "../files/FileService.js";
import type { ApplicationService } from "../applications/ApplicationService.js";
import type {
  ActionAuditSink,
  ActionConfirmationToken,
  ActionIntent,
  ActionPlan,
  ActionResult,
  ActionRollbackInfo,
} from "./types.js";
import { ACTION_ERROR_CODES } from "./types.js";
import { ActionRegistry } from "./ActionRegistry.js";
import { ActionPlanner } from "./ActionPlanner.js";
import { ActionRiskEvaluator } from "./ActionRiskEvaluator.js";
import { ActionPermissionPolicy } from "./ActionPermissionPolicy.js";
import { ActionConfirmation } from "./ActionConfirmation.js";
import { ActionExecutor } from "./ActionExecutor.js";
import { MemoryActionAuditLog } from "./ActionAuditLog.js";
import {
  DefaultActionRollback,
  type ActionRollback,
} from "./ActionRollback.js";
import { RiskLevel } from "../permissions/RiskLevel.js";

export interface ActionServiceOptions {
  files: FileService;
  applications: ApplicationService;
  permissions: PermissionManager;
  registry?: ActionRegistry;
  planner?: ActionPlanner;
  confirmation?: ActionConfirmation;
  executor?: ActionExecutor;
  audit?: ActionAuditSink;
  rollback?: ActionRollback;
  timeoutMs?: number;
}

/**
 * ActionService — Intent → Plan → Risk → Permission → Confirmation → Execute → Audit.
 * JARVIS never executes arbitrary shell commands.
 */
export class ActionService {
  readonly registry: ActionRegistry;
  readonly planner: ActionPlanner;
  readonly risk: ActionRiskEvaluator;
  readonly policy: ActionPermissionPolicy;
  readonly confirmation: ActionConfirmation;
  readonly executor: ActionExecutor;
  readonly audit: ActionAuditSink;
  readonly rollback: ActionRollback;
  private readonly permissions: PermissionManager;
  private readonly plans = new Map<string, ActionPlan>();
  private readonly approved = new Set<string>();

  constructor(options: ActionServiceOptions) {
    this.permissions = options.permissions;
    this.registry = options.registry ?? new ActionRegistry();
    this.planner = options.planner ?? new ActionPlanner(this.registry);
    this.risk = new ActionRiskEvaluator();
    this.policy = new ActionPermissionPolicy();
    this.confirmation = options.confirmation ?? new ActionConfirmation();
    this.executor =
      options.executor ??
      new ActionExecutor({
        files: options.files,
        applications: options.applications,
        timeoutMs: options.timeoutMs,
      });
    this.audit = options.audit ?? new MemoryActionAuditLog();
    this.rollback =
      options.rollback ?? new DefaultActionRollback(this.executor);
  }

  getPlan(taskId: string): ActionPlan | undefined {
    return this.plans.get(taskId);
  }

  listPlans(): ActionPlan[] {
    return [...this.plans.values()];
  }

  plan(
    intent: ActionIntent,
    options?: { dryRun?: boolean },
  ): ActionResult<ActionPlan> {
    const result = this.planner.plan(intent, { dryRun: options?.dryRun });
    if (!result.success || !result.data) {
      this.record(
        "UNKNOWN",
        null,
        "none",
        "DENIED",
        result.error?.code ?? ACTION_ERROR_CODES.UNKNOWN_ACTION,
        { taskId: null },
      );
      return result;
    }

    const plan = result.data;
    this.plans.set(plan.taskId, plan);
    this.record(
      plan.actionType,
      plan.riskLevel,
      "none",
      plan.status,
      "PLANNED",
      { taskId: plan.taskId, dryRun: plan.dryRun === true },
    );
    return { success: true, data: { ...plan } };
  }

  requestConfirmation(taskId: string): ActionResult<{
    request: ReturnType<ActionConfirmation["buildRequest"]>;
    token: ActionConfirmationToken;
  }> {
    const plan = this.plans.get(taskId);
    if (!plan) {
      return fail(ACTION_ERROR_CODES.NOT_FOUND, "Plan not found");
    }
    if (plan.status === "COMPLETED") {
      return fail(
        ACTION_ERROR_CODES.ALREADY_COMPLETED,
        "Plan already completed",
      );
    }
    if (
      plan.status !== "CONFIRMATION_REQUIRED" &&
      plan.status !== "PLANNED"
    ) {
      return fail(
        ACTION_ERROR_CODES.INVALID_STATE,
        `Cannot request confirmation in status ${plan.status}`,
      );
    }

    const perm = this.policy.evaluate(plan, this.permissions);
    if (perm.decision === "deny") {
      plan.status = "DENIED";
      this.record(
        plan.actionType,
        plan.riskLevel,
        "denied",
        "DENIED",
        ACTION_ERROR_CODES.DENIED,
        { taskId },
      );
      return fail(ACTION_ERROR_CODES.DENIED, perm.reason);
    }

    plan.status = "CONFIRMATION_REQUIRED";
    const request = this.confirmation.buildRequest(plan);
    const token = this.confirmation.issue(plan);
    this.record(
      plan.actionType,
      plan.riskLevel,
      "issued",
      plan.status,
      "CONFIRMATION_ISSUED",
      { taskId },
    );
    return { success: true, data: { request, token } };
  }

  confirm(
    taskId: string,
    token: ActionConfirmationToken,
  ): ActionResult<ActionPlan> {
    const plan = this.plans.get(taskId);
    if (!plan) {
      return fail(ACTION_ERROR_CODES.NOT_FOUND, "Plan not found");
    }
    if (plan.status === "COMPLETED") {
      return fail(
        ACTION_ERROR_CODES.ALREADY_COMPLETED,
        "Plan already completed",
      );
    }
    if (plan.status === "CANCELLED" || plan.status === "DENIED") {
      return fail(
        ACTION_ERROR_CODES.INVALID_STATE,
        `Cannot confirm plan in status ${plan.status}`,
      );
    }

    const check = this.confirmation.validateForApprove(plan, token);
    if (!check.ok) {
      this.record(
        plan.actionType,
        plan.riskLevel,
        "invalid",
        plan.status,
        check.code,
        { taskId },
      );
      return fail(check.code, check.message);
    }

    const consumed = this.confirmation.consume(plan, token);
    if (!consumed.ok) {
      return fail(consumed.code, consumed.message);
    }

    const perm = this.policy.evaluate(plan, this.permissions, {
      confirmed: true,
    });
    if (perm.decision === "deny") {
      plan.status = "DENIED";
      this.record(
        plan.actionType,
        plan.riskLevel,
        "denied",
        "DENIED",
        ACTION_ERROR_CODES.DENIED,
        { taskId },
      );
      return fail(ACTION_ERROR_CODES.DENIED, perm.reason);
    }

    plan.status = "APPROVED";
    this.approved.add(taskId);
    this.record(
      plan.actionType,
      plan.riskLevel,
      "approved",
      "APPROVED",
      "APPROVED",
      { taskId },
    );
    return { success: true, data: { ...plan } };
  }

  async execute(
    taskId: string,
    options?: { dryRun?: boolean; timeoutMs?: number },
  ): Promise<ActionResult<{ plan: ActionPlan; result: unknown }>> {
    const plan = this.plans.get(taskId);
    if (!plan) {
      return fail(ACTION_ERROR_CODES.NOT_FOUND, "Plan not found");
    }
    if (plan.status === "COMPLETED") {
      return fail(
        ACTION_ERROR_CODES.ALREADY_COMPLETED,
        "Plan already completed — idempotent deny",
      );
    }
    if (plan.status === "CANCELLED") {
      return fail(ACTION_ERROR_CODES.INVALID_STATE, "Plan was cancelled");
    }
    if (plan.status === "DENIED") {
      return fail(ACTION_ERROR_CODES.DENIED, "Plan was denied");
    }

    const dryRun = options?.dryRun === true || plan.dryRun === true;
    const statusBefore = plan.status;

    if (!dryRun) {
      if (plan.requiresConfirmation && plan.status !== "APPROVED") {
        return fail(
          ACTION_ERROR_CODES.CONFIRMATION_REQUIRED,
          "Plan must be APPROVED before execute",
        );
      }
      if (plan.requiresConfirmation && plan.status === "PLANNED") {
        return fail(
          ACTION_ERROR_CODES.CONFIRMATION_REQUIRED,
          "Confirmation required before execute",
        );
      }
      if (plan.status !== "APPROVED" && plan.status !== "PLANNED") {
        return fail(
          ACTION_ERROR_CODES.INVALID_STATE,
          `Cannot execute from status ${plan.status}`,
        );
      }

      const perm = this.policy.evaluate(plan, this.permissions, {
        confirmed: true,
      });
      if (perm.decision === "deny") {
        plan.status = "DENIED";
        this.record(
          plan.actionType,
          plan.riskLevel,
          "denied",
          "DENIED",
          ACTION_ERROR_CODES.DENIED,
          { taskId },
        );
        return fail(ACTION_ERROR_CODES.DENIED, perm.reason);
      }
      if (perm.decision === "require_confirmation") {
        return fail(
          ACTION_ERROR_CODES.CONFIRMATION_REQUIRED,
          perm.reason,
        );
      }
    }

    plan.status = "EXECUTING";
    this.record(
      plan.actionType,
      plan.riskLevel,
      dryRun ? "dry_run" : "approved",
      "EXECUTING",
      "EXECUTING",
      { taskId },
    );

    try {
      const result = await this.executor.execute(plan, {
        dryRun,
        timeoutMs: options?.timeoutMs,
      });
      if (!result.success) {
        const code = result.error?.code ?? ACTION_ERROR_CODES.EXECUTION_FAILED;
        plan.status = "FAILED";
        plan.resultCode = code;
        plan.errorMessage = result.error?.message ?? "Execution failed";
        plan.completedAt = Date.now();
        this.record(
          plan.actionType,
          plan.riskLevel,
          dryRun ? "dry_run" : "approved",
          "FAILED",
          code,
          { taskId },
        );
        return { success: false, error: result.error };
      }

      if (dryRun) {
        plan.status =
          statusBefore === "EXECUTING" ? "CONFIRMATION_REQUIRED" : statusBefore;
        this.record(
          plan.actionType,
          plan.riskLevel,
          "dry_run",
          plan.status,
          "DRY_RUN_OK",
          { taskId },
        );
        return {
          success: true,
          data: { plan: { ...plan }, result: result.data },
        };
      }

      plan.status = "COMPLETED";
      plan.resultCode = "OK";
      plan.completedAt = Date.now();
      this.record(
        plan.actionType,
        plan.riskLevel,
        "approved",
        "COMPLETED",
        "OK",
        { taskId },
      );
      return {
        success: true,
        data: { plan: { ...plan }, result: result.data },
      };
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: string }).code)
          : ACTION_ERROR_CODES.EXECUTION_FAILED;
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = code === ACTION_ERROR_CODES.TIMEOUT;
      plan.status = "FAILED";
      plan.resultCode = isTimeout
        ? ACTION_ERROR_CODES.TIMEOUT
        : ACTION_ERROR_CODES.EXECUTION_FAILED;
      plan.errorMessage = message;
      plan.completedAt = Date.now();
      this.record(
        plan.actionType,
        plan.riskLevel,
        "approved",
        "FAILED",
        plan.resultCode,
        { taskId },
      );
      return {
        success: false,
        error: {
          code: plan.resultCode,
          message,
        },
      };
    }
  }

  cancel(taskId: string): ActionResult<ActionPlan> {
    const plan = this.plans.get(taskId);
    if (!plan) {
      return fail(ACTION_ERROR_CODES.NOT_FOUND, "Plan not found");
    }
    if (plan.status === "EXECUTING") {
      return fail(
        ACTION_ERROR_CODES.CANCEL_UNAVAILABLE,
        "Cannot cancel while EXECUTING",
      );
    }
    if (plan.status === "COMPLETED") {
      return fail(
        ACTION_ERROR_CODES.ALREADY_COMPLETED,
        "Cannot cancel completed plan",
      );
    }
    if (
      plan.status === "CANCELLED" ||
      plan.status === "DENIED" ||
      plan.status === "FAILED"
    ) {
      return fail(
        ACTION_ERROR_CODES.INVALID_STATE,
        `Cannot cancel from ${plan.status}`,
      );
    }

    plan.status = "CANCELLED";
    plan.completedAt = Date.now();
    this.record(
      plan.actionType,
      plan.riskLevel,
      "cancelled",
      "CANCELLED",
      "CANCELLED",
      { taskId },
    );
    return { success: true, data: { ...plan } };
  }

  rollbackAvailability(taskId: string): ActionResult<ActionRollbackInfo> {
    const plan = this.plans.get(taskId);
    if (!plan) {
      return fail(ACTION_ERROR_CODES.NOT_FOUND, "Plan not found");
    }
    return { success: true, data: this.rollback.describe(plan) };
  }

  evaluateCriticalDenied(): boolean {
    return (
      this.policy.evaluateRiskOnly(RiskLevel.CRITICAL).decision === "deny"
    );
  }

  private record(
    actionType: ActionPlan["actionType"] | "UNKNOWN",
    riskLevel: RiskLevel | null,
    confirmationState: string,
    status: ActionPlan["status"] | "ERROR",
    resultCode: string,
    meta: Record<string, string | number | boolean | null>,
  ): void {
    this.audit.append({
      timestamp: new Date().toISOString(),
      taskId: typeof meta.taskId === "string" ? meta.taskId : "",
      actionType,
      riskLevel,
      confirmationState,
      status,
      resultCode,
      meta,
    });
  }
}

function fail(code: string, message: string): ActionResult<never> {
  return { success: false, error: { code, message } };
}
