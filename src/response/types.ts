/**
 * Phase 19 — natural response generation (explain only).
 * Never authorizes or executes.
 */

export type ResponseTone =
  | "neutral"
  | "helpful"
  | "concise"
  | "cautious"
  | "warm";

export type ResponseSourceCategory =
  | "ACTION_RESULT"
  | "CONTEXT_RESULT"
  | "MEMORY_RESULT"
  | "CONVERSATION_CONTEXT"
  | "CLARIFICATION"
  | "REFUSAL"
  | "ERROR"
  | "SYSTEM_STATUS"
  | "SECURITY_ASSESSMENT"
  | "EXPLICIT_RESULT"
  | "FALLBACK";

/** Category imposed by DecisionEngine / Runtime — LLM does not choose. */
export type ResponseCategory =
  | "ACTION_SUCCESS"
  | "ACTION_FAILURE"
  | "ACTION_DENIED"
  | "ACTION_CANCELLED"
  | "ACTION_TIMEOUT"
  | "ACTION_CONFIRMATION"
  | "ANSWER"
  | "CLARIFICATION"
  | "REFUSAL"
  | "NO_ACTION"
  | "ERROR"
  | "DEFER";

export interface ResponseFact {
  key: string;
  value: string;
  source: ResponseSourceCategory;
}

export interface ResponseDraft {
  text: string;
  tone: ResponseTone;
  source: ResponseSourceCategory;
  confidence: number;
  facts: ResponseFact[];
  warnings: string[];
  category: ResponseCategory;
  usedLlm: boolean;
}

export interface ResponseGenerateRequest {
  category: ResponseCategory;
  userMessage: string;
  /** Precomputed deterministic fallback — always available. */
  fallbackText: string;
  facts: ResponseFact[];
  decisionType?: string | null;
  decisionConfidence?: number | null;
  clarificationQuestion?: string | null;
  actionResult?: {
    status: "success" | "failure" | "denied" | "cancelled" | "timeout" | "pending";
    actionType?: string;
    summary?: string;
    detail?: string;
  } | null;
  contextResult?: {
    available: boolean;
    summary?: string;
    reason?: string;
  } | null;
  memoryHints?: Array<{ kind: string; content: string }>;
  securityAssessment?: {
    level?: string;
    confidence?: number;
    summary?: string;
    disclaimer?: string;
  } | null;
  errors?: Array<{ code?: string; message: string }>;
  conversationHints?: string[];
  locale?: "fr";
}

export interface ResponseTiming {
  policyMs: number;
  llmMs: number | null;
  validationMs: number;
  formattingMs: number;
  totalMs: number;
}

export interface ResponseAuditEntry {
  timestamp: string;
  responseId: string;
  category: ResponseCategory;
  source: ResponseSourceCategory;
  confidence: number;
  usedLlm: boolean;
  latencyMs: number;
  result: string;
  /** Fact keys only — never full values that may be private. */
  factKeys: string[];
}

export const RESPONSE_MEMORY_BUDGET = {
  maxMemories: 5,
  maxCharacters: 800,
} as const;
