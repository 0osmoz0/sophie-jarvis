import { RiskLevel } from "../permissions/RiskLevel.js";
import type { ActionType } from "./types.js";
import { isActionType } from "./types.js";

/**
 * ActionRiskEvaluator — maps typed actions to risk.
 * Unknown → DENIED. CRITICAL → never auto-allowed.
 */
export class ActionRiskEvaluator {
  riskFor(actionType: ActionType): RiskLevel {
    switch (actionType) {
      case "FILE_COPY":
      case "FILE_MOVE":
      case "FILE_CREATE":
      case "APP_OPEN":
      case "APP_CLOSE":
        return RiskLevel.MEDIUM;
      case "FILE_DELETE":
        return RiskLevel.HIGH;
    }
  }

  requiresConfirmation(actionType: ActionType): boolean {
    const risk = this.riskFor(actionType);
    return (
      risk === RiskLevel.MEDIUM ||
      risk === RiskLevel.HIGH ||
      risk === RiskLevel.CRITICAL
    );
  }

  /** CRITICAL is always denied at the action layer. */
  isExecutable(risk: RiskLevel): boolean {
    return risk !== RiskLevel.CRITICAL;
  }

  evaluateUnknown(type: unknown): {
    allowed: false;
    reason: string;
  } {
    return {
      allowed: false,
      reason: isActionType(type)
        ? "Action not permitted"
        : `Unknown action type: ${String(type)}`,
    };
  }
}
