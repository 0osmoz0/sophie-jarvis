import type { PermissionManager } from "../permissions/PermissionManager.js";
import { RiskLevel } from "../permissions/RiskLevel.js";
import type { PermissionDecision, ToolExecutionRequest } from "../core/types.js";
import type { ActionPlan } from "./types.js";
import { ACTION_ERROR_CODES } from "./types.js";
import { ActionRiskEvaluator } from "./ActionRiskEvaluator.js";

/**
 * ActionPermissionPolicy — every action goes through PermissionManager.
 * No bypass path.
 */
export class ActionPermissionPolicy {
  private readonly risk = new ActionRiskEvaluator();

  evaluate(
    plan: ActionPlan,
    permissions: PermissionManager,
    options?: { confirmed?: boolean },
  ): PermissionDecision {
    if (!this.risk.isExecutable(plan.riskLevel)) {
      return {
        decision: "deny",
        reason: `${ACTION_ERROR_CODES.CRITICAL_DENIED}: CRITICAL actions are denied`,
      };
    }

    const request: ToolExecutionRequest = {
      toolId: `action.${plan.actionType}`,
      riskLevel: plan.riskLevel,
      arguments: { taskId: plan.taskId, actionType: plan.actionType },
      taskId: plan.taskId,
    };

    if (options?.confirmed) {
      return permissions.evaluateWithConfirmation(request, true);
    }
    return permissions.evaluate(request);
  }

  evaluateRiskOnly(riskLevel: RiskLevel): PermissionDecision {
    if (riskLevel === RiskLevel.CRITICAL) {
      return {
        decision: "deny",
        reason: `${ACTION_ERROR_CODES.CRITICAL_DENIED}: CRITICAL actions are denied`,
      };
    }
    if (riskLevel === RiskLevel.LOW) {
      return { decision: "allow" };
    }
    return {
      decision: "require_confirmation",
      reason: `${riskLevel} requires confirmation`,
    };
  }
}
