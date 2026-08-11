/**
 * Phase 18 — Decision & Reasoning Engine types.
 * Decision ≠ Authorization. LLM interprets; DecisionEngine evaluates.
 */

export type DecisionType =
  | "ANSWER"
  | "ACTION"
  | "CLARIFICATION"
  | "REFUSAL"
  | "NO_ACTION"
  | "DEFER"
  | "INFORMATION_REQUIRED";

export type ConfidenceCategory =
  | "VERY_LOW"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "VERY_HIGH";

/** USER_REQUESTED actions may proceed to planner; CONTEXT_SUGGESTED never auto-acts. */
export type DecisionOrigin = "USER_REQUESTED" | "CONTEXT_SUGGESTED";

export type DecisionEvidenceSource =
  | "explicit_user_message"
  | "user_correction"
  | "conversation_reference"
  | "environment"
  | "memory"
  | "llm_inference"
  | "security_context"
  | "intent_validation";

export interface DecisionEvidence {
  source: DecisionEvidenceSource;
  summary: string;
  /** Soft weight 0–1 — informational only. */
  weight?: number;
}

export interface DecisionActionIntent {
  type: string;
  payload: Record<string, unknown>;
}

export interface Decision {
  id: string;
  type: DecisionType;
  confidence: number;
  confidenceCategory: ConfidenceCategory;
  reasons: string[];
  evidence: DecisionEvidence[];
  missingInformation: string[];
  riskLevel: string | null;
  requiresClarification: boolean;
  requiresConfirmation: boolean;
  actionIntent?: DecisionActionIntent;
  /** Optional user-facing clarification question (minimal). */
  clarificationQuestion?: string;
  /** Optional answer / refusal message hint (not secrets). */
  messageHint?: string;
  origin: DecisionOrigin;
  /** Intent router kind that informed this decision (audit). */
  sourceIntentKind?: string | null;
  expiresAt?: number;
  /** Memory was consulted for this decision. */
  memoryUsed: boolean;
  /** Environment/context snapshot was consulted. */
  contextUsed: boolean;
  contradictionDetected: boolean;
}

export interface DecisionTiming {
  decisionMs: number;
  validationMs: number;
  memoryMs: number;
  contextMs: number;
  totalDecisionMs: number;
}

export interface DecisionAuditEntry {
  timestamp: string;
  decisionId: string;
  type: DecisionType;
  confidence: number;
  risk: string | null;
  /** Categories only — never full message/memory content. */
  sourceCategories: DecisionEvidenceSource[];
  latencyMs: number;
  result: string;
  memoryUsed: boolean;
  contextUsed: boolean;
  contradictionDetected: boolean;
  origin: DecisionOrigin;
}

export const DECISION_PRIORITY = [
  "explicit_user_message",
  "user_correction",
  "conversation_reference",
  "environment",
  "memory",
  "llm_inference",
] as const;

export const ACTION_MIN_CONFIDENCE = 0.72;

export function confidenceCategory(score: number): ConfidenceCategory {
  if (score < 0.2) return "VERY_LOW";
  if (score < 0.4) return "LOW";
  if (score < 0.65) return "MEDIUM";
  if (score < 0.85) return "HIGH";
  return "VERY_HIGH";
}

export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
