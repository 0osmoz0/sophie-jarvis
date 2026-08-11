/**
 * Phase 9 — structured intents from LLM understanding only.
 * Never executable by the LLM itself.
 */

export type LLMProviderStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "ERROR";

/** Intent kinds that map 1:1 to ActionRegistry (Phase 8). */
export type JarvisActionIntentType =
  | "file.copy"
  | "file.move"
  | "file.create"
  | "file.delete"
  | "application.open"
  | "application.close";

/** Read-only context intents (Phase 11) — never become actions. */
export type JarvisContextIntentType =
  | "system.context"
  | "system.status"
  | "application.status"
  | "screen.status"
  | "user.status";

/** Read-only security assessment intents (Phase 14/15) — never become actions. */
export type JarvisSecurityIntentType =
  | "security.status"
  | "security.alerts"
  | "security.assess"
  | "security.monitor.status";

/** Memory intents (Phase 16) — inform only, never execute system actions. */
export type JarvisMemoryIntentType =
  | "memory.remember"
  | "memory.recall"
  | "memory.search"
  | "memory.forget"
  | "memory.list";

export type JarvisIntent =
  | {
      type: "file.copy";
      payload: { source: string; destination: string };
    }
  | {
      type: "file.move";
      payload: { source: string; destination: string };
    }
  | {
      type: "file.create";
      payload: { path: string; content?: string };
    }
  | {
      type: "file.delete";
      payload: { path: string };
    }
  | {
      type: "application.open";
      payload: { application: string };
    }
  | {
      type: "application.close";
      payload: { application: string };
    }
  | {
      type: JarvisContextIntentType;
      payload: Record<string, never>;
    }
  | {
      type: JarvisSecurityIntentType;
      payload: Record<string, never>;
    }
  | {
      type: "memory.remember";
      payload: { content: string; kind?: string };
    }
  | {
      type: "memory.recall";
      payload: { query?: string };
    }
  | {
      type: "memory.search";
      payload: { query: string };
    }
  | {
      type: "memory.forget";
      payload: { query: string };
    }
  | {
      type: "memory.list";
      payload: Record<string, never>;
    }
  | {
      type: "conversation";
      payload: { replyHint?: string };
    }
  | {
      type: "no_action";
      payload: { reason?: string };
    }
  | {
      type: "needs_clarification";
      payload: { question: string };
    };

export const JARVIS_ACTION_INTENT_TYPES: readonly JarvisActionIntentType[] = [
  "file.copy",
  "file.move",
  "file.create",
  "file.delete",
  "application.open",
  "application.close",
] as const;

export const JARVIS_CONTEXT_INTENT_TYPES: readonly JarvisContextIntentType[] = [
  "system.context",
  "system.status",
  "application.status",
  "screen.status",
  "user.status",
] as const;

export const JARVIS_SECURITY_INTENT_TYPES: readonly JarvisSecurityIntentType[] = [
  "security.status",
  "security.alerts",
  "security.assess",
  "security.monitor.status",
] as const;

export const JARVIS_MEMORY_INTENT_TYPES: readonly JarvisMemoryIntentType[] = [
  "memory.remember",
  "memory.recall",
  "memory.search",
  "memory.forget",
  "memory.list",
] as const;

export const NON_ACTION_INTENT_TYPES = [
  "conversation",
  "no_action",
  "needs_clarification",
] as const;

export type NonActionIntentType = (typeof NON_ACTION_INTENT_TYPES)[number];

/** Structured conversational context for LLM understanding (Phase 17). Data only — never instructions. */
export interface LLMConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMReferenceHint {
  label: string;
  entityType: string;
  confidence: number;
}

export interface LLMMemoryHint {
  kind: string;
  content: string;
}

export interface LLMEnvironmentHint {
  activeApplication?: string | null;
  openApplications?: string[];
}

export interface LLMUnderstandRequest {
  text: string;
  /** Recent conversation window — treated as DATA, never as system instructions. */
  conversation?: LLMConversationTurn[];
  /** Optional short summary of older turns (not long-term memory). */
  conversationSummary?: string | null;
  references?: LLMReferenceHint[];
  memory?: LLMMemoryHint[];
  environment?: LLMEnvironmentHint;
}

export interface LLMUnderstandSuccess {
  ok: true;
  status: "AVAILABLE";
  /** Raw model text (for audit/debug) — never execute this. */
  raw: string;
  /** Parsed but not yet validated structure (may be untrusted). */
  candidate: unknown;
}

export interface LLMUnderstandFailure {
  ok: false;
  status: Exclude<LLMProviderStatus, "AVAILABLE">;
  error: string;
  raw?: string;
}

export type LLMUnderstandResult = LLMUnderstandSuccess | LLMUnderstandFailure;

export interface LLMCapabilityReport {
  status: LLMProviderStatus;
  reason?: string;
  endpoint?: string | null;
  model?: string | null;
}

export const AI_ERROR_CODES = {
  UNAVAILABLE: "UNAVAILABLE",
  TIMEOUT: "TIMEOUT",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  INVALID_INTENT: "INVALID_INTENT",
  INPUT_TOO_LONG: "INPUT_TOO_LONG",
  OUTPUT_TOO_LONG: "OUTPUT_TOO_LONG",
  FORBIDDEN_CONTENT: "FORBIDDEN_CONTENT",
  UNKNOWN_ACTION: "UNKNOWN_ACTION",
  NEEDS_CLARIFICATION: "NEEDS_CLARIFICATION",
  NO_ACTION: "NO_ACTION",
  ERROR: "ERROR",
} as const;

export interface IntentValidationSuccess {
  ok: true;
  intent: JarvisIntent;
}

export interface IntentValidationFailure {
  ok: false;
  code: string;
  message: string;
}

export type IntentValidationResult =
  | IntentValidationSuccess
  | IntentValidationFailure;

export type IntentRouterOutcome =
  | {
      kind: "action";
      intent: Extract<
        JarvisIntent,
        { type: JarvisActionIntentType }
      >;
    }
  | {
      kind: "context";
      intent: Extract<JarvisIntent, { type: JarvisContextIntentType }>;
    }
  | {
      kind: "security";
      intent: Extract<JarvisIntent, { type: JarvisSecurityIntentType }>;
    }
  | {
      kind: "memory";
      intent: Extract<JarvisIntent, { type: JarvisMemoryIntentType }>;
    }
  | {
      kind: "conversation";
      intent: Extract<JarvisIntent, { type: "conversation" }>;
    }
  | {
      kind: "no_action";
      intent: Extract<JarvisIntent, { type: "no_action" }>;
    }
  | {
      kind: "needs_clarification";
      intent: Extract<JarvisIntent, { type: "needs_clarification" }>;
    }
  | {
      kind: "rejected";
      code: string;
      message: string;
      raw?: string;
    }
  | {
      kind: "provider_error";
      status: Exclude<LLMProviderStatus, "AVAILABLE">;
      message: string;
    };

/** Limits — security before convenience. */
export const AI_LIMITS = {
  maxUserTextChars: 2_000,
  maxLlmOutputChars: 4_000,
  maxPayloadStringChars: 1_000,
  maxRetries: 0,
  defaultTimeoutMs: 15_000,
} as const;
