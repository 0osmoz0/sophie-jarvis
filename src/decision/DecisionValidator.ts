import type { Decision, DecisionActionIntent } from "./types.js";

export interface DecisionValidationResult {
  ok: boolean;
  code?: string;
  message?: string;
}

const FORBIDDEN_PAYLOAD_KEYS = [
  "command",
  "shell",
  "permissionGranted",
  "confirmationGranted",
  "permission_granted",
  "confirmation_granted",
  "execute",
] as const;

/**
 * DecisionValidator — structural checks on Decision objects.
 * Does not authorize execution.
 */
export class DecisionValidator {
  validate(decision: Decision): DecisionValidationResult {
    if (!decision.id || typeof decision.id !== "string") {
      return fail("INVALID_DECISION", "missing id");
    }
    if (
      typeof decision.confidence !== "number" ||
      decision.confidence < 0 ||
      decision.confidence > 1
    ) {
      return fail("INVALID_CONFIDENCE", "confidence must be 0..1");
    }
    if (decision.type === "ACTION") {
      if (!decision.actionIntent) {
        return fail("INVALID_ACTION", "ACTION requires actionIntent");
      }
      const payloadCheck = validateActionIntent(decision.actionIntent);
      if (!payloadCheck.ok) return payloadCheck;
      if (decision.origin === "CONTEXT_SUGGESTED") {
        return fail(
          "FORBIDDEN_ORIGIN",
          "CONTEXT_SUGGESTED cannot be ACTION",
        );
      }
      if (decision.requiresClarification) {
        return fail(
          "INVALID_ACTION",
          "ACTION cannot require clarification",
        );
      }
    }
    if (
      (decision.type === "CLARIFICATION" ||
        decision.type === "INFORMATION_REQUIRED") &&
      !decision.clarificationQuestion &&
      !decision.messageHint
    ) {
      return fail(
        "INVALID_CLARIFICATION",
        "clarification requires a question",
      );
    }
    return { ok: true };
  }
}

function validateActionIntent(
  intent: DecisionActionIntent,
): DecisionValidationResult {
  if (!intent.type || typeof intent.type !== "string") {
    return fail("INVALID_ACTION", "actionIntent.type required");
  }
  if (!intent.payload || typeof intent.payload !== "object") {
    return fail("INVALID_ACTION", "actionIntent.payload required");
  }
  for (const key of Object.keys(intent.payload)) {
    const lower = key.toLowerCase();
    for (const bad of FORBIDDEN_PAYLOAD_KEYS) {
      if (bad.toLowerCase() === lower) {
        return fail("FORBIDDEN_PAYLOAD", `forbidden field: ${key}`);
      }
    }
  }
  return { ok: true };
}

function fail(code: string, message: string): DecisionValidationResult {
  return { ok: false, code, message };
}
