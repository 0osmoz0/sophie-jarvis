import { RiskLevel } from "./RiskLevel.js";
import type {
  PermissionDecision,
  ToolExecutionRequest,
} from "../core/types.js";

export interface PermissionManagerOptions {
  /**
   * Future: explicit override mechanism for CRITICAL tools.
   * Phase 1: always false — CRITICAL is always denied.
   */
  allowCriticalOverride?: boolean;
}

/**
 * PermissionManager — gate between Intent and Tool execution.
 *
 * Rules (Phase 1):
 *   LOW      → allow
 *   MEDIUM   → require confirmation
 *   HIGH     → require confirmation
 *   CRITICAL → deny (no automatic path; override reserved for later)
 *
 * No tool may bypass this manager. Only JarvisCore calls evaluate().
 */
export class PermissionManager {
  private readonly allowCriticalOverride: boolean;

  constructor(options: PermissionManagerOptions = {}) {
    this.allowCriticalOverride = options.allowCriticalOverride ?? false;
  }

  evaluate(request: ToolExecutionRequest): PermissionDecision {
    switch (request.riskLevel) {
      case RiskLevel.LOW:
        return { decision: "allow" };

      case RiskLevel.MEDIUM:
        return {
          decision: "require_confirmation",
          reason: `Tool "${request.toolId}" is MEDIUM risk and requires user confirmation.`,
        };

      case RiskLevel.HIGH:
        return {
          decision: "require_confirmation",
          reason: `Tool "${request.toolId}" is HIGH risk and requires explicit user confirmation.`,
        };

      case RiskLevel.CRITICAL:
        if (this.allowCriticalOverride) {
          // Reserved for a future explicit dual-control mechanism.
          // Phase 1 still denies — override flag alone is insufficient.
          return {
            decision: "deny",
            reason: `Tool "${request.toolId}" is CRITICAL. Explicit override mechanism is not yet defined.`,
          };
        }
        return {
          decision: "deny",
          reason: `Tool "${request.toolId}" is CRITICAL and cannot be executed automatically.`,
        };

      default: {
        const _exhaustive: never = request.riskLevel;
        return {
          decision: "deny",
          reason: `Unknown risk level: ${String(_exhaustive)}`,
        };
      }
    }
  }

  /**
   * Re-evaluate after the user has supplied a confirmation token.
   * MEDIUM / HIGH may proceed once confirmed. CRITICAL still denied in Phase 1.
   */
  evaluateWithConfirmation(
    request: ToolExecutionRequest,
    confirmed: boolean,
  ): PermissionDecision {
    if (request.riskLevel === RiskLevel.CRITICAL) {
      return {
        decision: "deny",
        reason: `Tool "${request.toolId}" is CRITICAL and cannot be executed even with confirmation (Phase 1).`,
      };
    }

    if (
      (request.riskLevel === RiskLevel.MEDIUM ||
        request.riskLevel === RiskLevel.HIGH) &&
      confirmed
    ) {
      return { decision: "allow" };
    }

    return this.evaluate(request);
  }
}
