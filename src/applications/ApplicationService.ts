import { RiskLevel } from "../permissions/RiskLevel.js";
import { ApplicationRegistry } from "./ApplicationRegistry.js";
import { ApplicationResolver } from "./ApplicationResolver.js";
import { ApplicationPolicy } from "./ApplicationPolicy.js";
import { MemoryApplicationAuditLog } from "./ApplicationAuditLog.js";
import type {
  ApplicationAction,
  ApplicationAuditSink,
  ApplicationInfo,
  ApplicationResult,
  RegisteredApplication,
} from "./types.js";
import { APPLICATION_ERROR_CODES } from "./types.js";

export interface ApplicationServiceOptions {
  registry?: ApplicationRegistry;
  resolver?: ApplicationResolver;
  policy?: ApplicationPolicy;
  audit?: ApplicationAuditSink;
}

/**
 * ApplicationService — sole gateway for application lifecycle.
 *
 * Phase 4 (Node, no native bindings, no shell / no scripting bridges):
 * - list/info from explicit registry (+ optional path existence check)
 * - active/open/close on the default macOS backend → UNAVAILABLE
 *   (safe native APIs would require TCC / native modules not enabled here)
 *
 * Use MockApplicationService in tests to exercise open/close without touching
 * the user's real apps. System tests are opt-in via JARVIS_APP_SYSTEM_TESTS=1
 * (still unavailable without a native backend).
 */
export class ApplicationService {
  readonly registry: ApplicationRegistry;
  readonly resolver: ApplicationResolver;
  readonly policy: ApplicationPolicy;
  readonly audit: ApplicationAuditSink;

  constructor(options: ApplicationServiceOptions = {}) {
    this.registry = options.registry ?? new ApplicationRegistry();
    this.resolver =
      options.resolver ?? new ApplicationResolver(this.registry);
    this.policy = options.policy ?? new ApplicationPolicy();
    this.audit = options.audit ?? new MemoryApplicationAuditLog();
  }

  async list(): Promise<ApplicationResult<{ applications: ApplicationInfo[] }>> {
    const policy = this.policy.evaluate("list");
    if (!policy.allowed) {
      return this.fail("list", policy.code ?? APPLICATION_ERROR_CODES.DENIED, policy.reason ?? "Denied", {
        risk: policy.riskLevel,
      });
    }

    const apps: ApplicationInfo[] = [];
    for (const reg of this.registry.list()) {
      apps.push(await this.toInfo(reg, { running: null, active: null }));
    }

    this.record({
      action: "list",
      toolId: "application.list",
      application: null,
      bundleId: null,
      riskLevel: RiskLevel.LOW,
      confirmation: false,
      result: "success",
    });

    return { success: true, data: { applications: apps } };
  }

  async info(args: {
    name?: string;
    bundleId?: string;
    path?: string;
    id?: string;
  }): Promise<ApplicationResult<ApplicationInfo>> {
    const resolved = this.resolver.fromArgs(args);
    if (!resolved.ok) {
      return this.fail("info", resolved.code, resolved.message, {
        application: typeof args.name === "string" ? args.name : null,
      });
    }

    const decision = this.policy.evaluate("info", resolved.app);
    if (!decision.allowed) {
      return this.fail("info", decision.code ?? APPLICATION_ERROR_CODES.DENIED, decision.reason ?? "Denied", {
        application: resolved.app.name,
        bundleId: resolved.app.bundleId ?? null,
        risk: decision.riskLevel,
      });
    }

    const info = await this.toInfo(resolved.app, {
      running: await this.queryRunning(resolved.app),
      active: null,
    });

    this.record({
      action: "info",
      toolId: "application.info",
      application: info.name,
      bundleId: info.bundleId ?? null,
      riskLevel: RiskLevel.LOW,
      confirmation: false,
      result: "success",
    });

    return { success: true, data: info };
  }

  async active(): Promise<ApplicationResult<ApplicationInfo | null>> {
    const decision = this.policy.evaluate("active");
    if (!decision.allowed) {
      return this.fail("active", decision.code ?? APPLICATION_ERROR_CODES.DENIED, decision.reason ?? "Denied", {
        risk: decision.riskLevel,
      });
    }

    // Frontmost app requires Accessibility / native APIs — not enabled in Phase 4.
    this.record({
      action: "active",
      toolId: "application.active",
      application: null,
      bundleId: null,
      riskLevel: RiskLevel.LOW,
      confirmation: false,
      result: "unavailable",
      errorCode: APPLICATION_ERROR_CODES.UNAVAILABLE,
    });

    return {
      success: false,
      error: {
        code: APPLICATION_ERROR_CODES.UNAVAILABLE,
        message:
          "Frontmost application requires macOS Accessibility / native APIs not enabled in Phase 4. Returning unavailable (permission not bypassed).",
      },
    };
  }

  async open(
    args: {
      name?: string;
      bundleId?: string;
      path?: string;
      id?: string;
      taskId?: string | null;
      confirmed?: boolean;
    },
  ): Promise<ApplicationResult<ApplicationInfo>> {
    const resolved = this.resolver.fromArgs(args);
    if (!resolved.ok) {
      return this.fail("open", resolved.code, resolved.message, {
        application: typeof args.name === "string" ? args.name : null,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
        risk: RiskLevel.MEDIUM,
      });
    }

    const decision = this.policy.evaluate("open", resolved.app);
    if (!decision.allowed) {
      return this.fail("open", decision.code ?? APPLICATION_ERROR_CODES.DENIED, decision.reason ?? "Denied", {
        application: resolved.app.name,
        bundleId: resolved.app.bundleId ?? null,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
        risk: decision.riskLevel,
      });
    }

    return this.performOpen(resolved.app, {
      confirmed: !!args.confirmed,
      taskId: args.taskId ?? null,
    });
  }

  async close(
    args: {
      name?: string;
      bundleId?: string;
      path?: string;
      id?: string;
      taskId?: string | null;
      confirmed?: boolean;
    },
  ): Promise<ApplicationResult<ApplicationInfo>> {
    const resolved = this.resolver.fromArgs(args);
    if (!resolved.ok) {
      return this.fail("close", resolved.code, resolved.message, {
        application: typeof args.name === "string" ? args.name : null,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
        risk: RiskLevel.MEDIUM,
      });
    }

    const decision = this.policy.evaluate("close", resolved.app);
    if (!decision.allowed) {
      return this.fail("close", decision.code ?? APPLICATION_ERROR_CODES.DENIED, decision.reason ?? "Denied", {
        application: resolved.app.name,
        bundleId: resolved.app.bundleId ?? null,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
        risk: decision.riskLevel,
      });
    }

    return this.performClose(resolved.app, {
      confirmed: !!args.confirmed,
      taskId: args.taskId ?? null,
    });
  }

  /** Default backend: no shell and no scripting bridge — open is unavailable. */
  protected async performOpen(
    app: RegisteredApplication,
    meta: { confirmed: boolean; taskId: string | null },
  ): Promise<ApplicationResult<ApplicationInfo>> {
    this.record({
      action: "open",
      toolId: "application.open",
      application: app.name,
      bundleId: app.bundleId ?? null,
      riskLevel: RiskLevel.MEDIUM,
      confirmation: meta.confirmed,
      result: "unavailable",
      errorCode: APPLICATION_ERROR_CODES.UNAVAILABLE,
      taskId: meta.taskId,
    });
    return {
      success: false,
      error: {
        code: APPLICATION_ERROR_CODES.UNAVAILABLE,
        message:
          "Opening applications requires a safe native macOS API. Phase 4 forbids shell and process-spawning bridges; open is unavailable until a native backend is approved.",
      },
    };
  }

  /** Default backend: no forced termination APIs — close is unavailable. */
  protected async performClose(
    app: RegisteredApplication,
    meta: { confirmed: boolean; taskId: string | null },
  ): Promise<ApplicationResult<ApplicationInfo>> {
    this.record({
      action: "close",
      toolId: "application.close",
      application: app.name,
      bundleId: app.bundleId ?? null,
      riskLevel: RiskLevel.MEDIUM,
      confirmation: meta.confirmed,
      result: "unavailable",
      errorCode: APPLICATION_ERROR_CODES.UNAVAILABLE,
      taskId: meta.taskId,
    });
    return {
      success: false,
      error: {
        code: APPLICATION_ERROR_CODES.UNAVAILABLE,
        message:
          "Graceful application close requires a safe native macOS API. Phase 4 forbids forced process termination and scripting bridges; close is unavailable until a native backend is approved.",
      },
    };
  }

  protected async queryRunning(_app: RegisteredApplication): Promise<boolean | null> {
    // Process listing would need shell/native — do not invent.
    return null;
  }

  protected async toInfo(
    reg: RegisteredApplication,
    state: { running: boolean | null; active: boolean | null },
  ): Promise<ApplicationInfo> {
    return {
      id: reg.id,
      name: reg.name,
      bundleId: reg.bundleId ?? null,
      path: reg.path ?? null,
      running: state.running,
      active: state.active,
    };
  }

  protected fail(
    action: ApplicationAction,
    code: string,
    message: string,
    meta: {
      application?: string | null;
      bundleId?: string | null;
      confirmation?: boolean;
      taskId?: string | null;
      risk?: RiskLevel;
    } = {},
  ): ApplicationResult<never> {
    const resultKind =
      code === APPLICATION_ERROR_CODES.UNAVAILABLE
        ? "unavailable"
        : code === APPLICATION_ERROR_CODES.PERMISSION_REQUIRED
          ? "permission_required"
          : code === APPLICATION_ERROR_CODES.DENIED ||
              code === APPLICATION_ERROR_CODES.DENYLIST ||
              code === APPLICATION_ERROR_CODES.BLOCKED_PATH
            ? "denied"
            : "error";

    this.record({
      action,
      toolId: `application.${action}`,
      application: meta.application ?? null,
      bundleId: meta.bundleId ?? null,
      riskLevel: meta.risk ?? this.policy.riskFor(action),
      confirmation: meta.confirmation ?? false,
      result: resultKind,
      errorCode: code,
      taskId: meta.taskId,
    });

    return { success: false, error: { code, message } };
  }

  protected record(partial: {
    action: ApplicationAction;
    toolId: string;
    application: string | null;
    bundleId: string | null;
    riskLevel: RiskLevel;
    confirmation: boolean;
    result: "success" | "denied" | "error" | "unavailable" | "permission_required";
    errorCode?: string;
    taskId?: string | null;
  }): void {
    this.audit.append({
      timestamp: new Date().toISOString(),
      taskId: partial.taskId ?? null,
      toolId: partial.toolId,
      action: partial.action,
      application: partial.application,
      bundleId: partial.bundleId,
      riskLevel: partial.riskLevel,
      confirmation: partial.confirmation,
      result: partial.result,
      errorCode: partial.errorCode,
    });
  }
}

/**
 * MockApplicationService — in-memory lifecycle for safe unit/smoke tests.
 * Does not touch real macOS apps. Never uses shell.
 */
export class MockApplicationService extends ApplicationService {
  private readonly running = new Set<string>();
  private activeId: string | null = null;

  protected override async queryRunning(app: RegisteredApplication): Promise<boolean | null> {
    return this.running.has(app.id);
  }

  override async active(): Promise<ApplicationResult<ApplicationInfo | null>> {
    if (!this.activeId) {
      this.record({
        action: "active",
        toolId: "application.active",
        application: null,
        bundleId: null,
        riskLevel: RiskLevel.LOW,
        confirmation: false,
        result: "success",
      });
      return { success: true, data: null };
    }
    const reg = this.registry.get(this.activeId);
    if (!reg) {
      return { success: true, data: null };
    }
    const info = await this.toInfo(reg, { running: true, active: true });
    this.record({
      action: "active",
      toolId: "application.active",
      application: info.name,
      bundleId: info.bundleId ?? null,
      riskLevel: RiskLevel.LOW,
      confirmation: false,
      result: "success",
    });
    return { success: true, data: info };
  }

  protected override async performOpen(
    app: RegisteredApplication,
    meta: { confirmed: boolean; taskId: string | null },
  ): Promise<ApplicationResult<ApplicationInfo>> {
    this.running.add(app.id);
    this.activeId = app.id;
    const info = await this.toInfo(app, { running: true, active: true });
    this.record({
      action: "open",
      toolId: "application.open",
      application: app.name,
      bundleId: app.bundleId ?? null,
      riskLevel: RiskLevel.MEDIUM,
      confirmation: meta.confirmed,
      result: "success",
      taskId: meta.taskId,
    });
    return { success: true, data: info };
  }

  protected override async performClose(
    app: RegisteredApplication,
    meta: { confirmed: boolean; taskId: string | null },
  ): Promise<ApplicationResult<ApplicationInfo>> {
    if (!this.running.has(app.id)) {
      return this.fail("close", APPLICATION_ERROR_CODES.NOT_RUNNING, `Application "${app.name}" is not running`, {
        application: app.name,
        bundleId: app.bundleId ?? null,
        confirmation: meta.confirmed,
        taskId: meta.taskId,
        risk: RiskLevel.MEDIUM,
      });
    }
    this.running.delete(app.id);
    if (this.activeId === app.id) this.activeId = null;
    const info = await this.toInfo(app, { running: false, active: false });
    this.record({
      action: "close",
      toolId: "application.close",
      application: app.name,
      bundleId: app.bundleId ?? null,
      riskLevel: RiskLevel.MEDIUM,
      confirmation: meta.confirmed,
      result: "success",
      taskId: meta.taskId,
    });
    return { success: true, data: info };
  }

  /** Test helper — seed running state without open(). */
  mockSetRunning(id: string, running: boolean): void {
    if (running) this.running.add(id);
    else this.running.delete(id);
  }
}
