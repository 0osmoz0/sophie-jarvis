import type {
  ConfidenceCategory,
  Decision,
  DecisionType,
} from "./types.js";
import { ACTION_MIN_CONFIDENCE } from "./types.js";

/**
 * DecisionPolicy — gating rules for decision types.
 * Never grants permissions; never calls ActionExecutor.
 */
export class DecisionPolicy {
  /** Minimum confidence to allow ACTION candidate. */
  readonly actionMinConfidence: number;

  constructor(options?: { actionMinConfidence?: number }) {
    this.actionMinConfidence =
      options?.actionMinConfidence ?? ACTION_MIN_CONFIDENCE;
  }

  canProposeAction(decision: Pick<
    Decision,
    "confidence" | "confidenceCategory" | "origin" | "requiresClarification" | "contradictionDetected" | "missingInformation"
  >): { ok: boolean; reason?: string } {
    if (decision.origin === "CONTEXT_SUGGESTED") {
      return {
        ok: false,
        reason: "CONTEXT_SUGGESTED cannot become ACTION",
      };
    }
    if (decision.requiresClarification) {
      return { ok: false, reason: "clarification required" };
    }
    if (decision.contradictionDetected && decision.missingInformation.length) {
      return { ok: false, reason: "blocking contradiction" };
    }
    if (decision.confidence < this.actionMinConfidence) {
      return {
        ok: false,
        reason: `confidence ${decision.confidence.toFixed(2)} below ${this.actionMinConfidence}`,
      };
    }
    const cat = decision.confidenceCategory;
    if (cat === "VERY_LOW" || cat === "LOW") {
      return { ok: false, reason: `confidence category ${cat}` };
    }
    if (decision.missingInformation.length > 0) {
      return { ok: false, reason: "missing information" };
    }
    return { ok: true };
  }

  /**
   * Map low-confidence action attempts to clarification / information required.
   */
  downgradeAction(
    type: DecisionType,
    category: ConfidenceCategory,
    missing: string[],
  ): DecisionType {
    if (type !== "ACTION") return type;
    if (category === "VERY_LOW" || category === "LOW") {
      return missing.length ? "INFORMATION_REQUIRED" : "CLARIFICATION";
    }
    if (missing.length) return "INFORMATION_REQUIRED";
    return type;
  }
}
