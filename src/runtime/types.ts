/**
 * Phase 10 — interactive runtime response model.
 * Structured for CLI / Sophie / voice / desktop later.
 */

export type RuntimeState =
  | "IDLE"
  | "UNDERSTANDING"
  | "PLANNING"
  | "WAITING_CONFIRMATION"
  | "EXECUTING"
  | "COMPLETED"
  | "ERROR";

export type JarvisResponse =
  | {
      type: "message";
      message: string;
    }
  | {
      type: "clarification";
      message: string;
      options?: string[];
    }
  | {
      type: "confirmation_required";
      taskId: string;
      message: string;
      expiresAt: number;
    }
  | {
      type: "executed";
      taskId: string;
      message: string;
      result: unknown;
    }
  | {
      type: "cancelled";
      taskId: string;
      message: string;
    }
  | {
      type: "error";
      message: string;
      code: string;
    };

export interface InteractionTiming {
  llmMs: number | null;
  validationMs: number | null;
  planningMs: number | null;
  confirmationMs: number | null;
  executionMs: number | null;
  totalMs: number;
  /** Phase 17 — conversation prep (append/window/refs/memory). */
  conversationMs?: number | null;
  /** Phase 18 — DecisionEngine evaluation. */
  decisionMs?: number | null;
  /** Phase 19 — natural response generation. */
  responseGenerationMs?: number | null;
  /** Phase 20 — detailed pipeline counters. */
  llmUnderstandCalls?: number;
  llmResponseCalls?: number;
  referenceResolutionMs?: number | null;
  memoryRecallMs?: number | null;
  memoryRecallUsed?: boolean;
  memoryRecallSkipped?: boolean;
  contextMs?: number | null;
}

export interface RuntimeAuditEntry {
  timestamp: string;
  interactionId: string;
  /** Message id only — never message.content (privacy). */
  messageId?: string | null;
  role?: string | null;
  intentType: string | null;
  planStatus: string | null;
  risk: string | null;
  confirmationStatus: string | null;
  executionStatus: string | null;
  resultCode: string | null;
  latencyMs: number;
  state: RuntimeState;
}

export interface RuntimeAuditSink {
  append(entry: RuntimeAuditEntry): void;
  list(): readonly RuntimeAuditEntry[];
}

export const RUNTIME_ERROR_CODES = {
  LLM_UNAVAILABLE: "LLM_UNAVAILABLE",
  NO_PENDING_CONFIRMATION: "NO_PENDING_CONFIRMATION",
  CONFIRMATION_EXPIRED: "CONFIRMATION_EXPIRED",
  CANCELLED: "CANCELLED",
  EXECUTION_FAILED: "EXECUTION_FAILED",
  PLAN_FAILED: "PLAN_FAILED",
  INVALID_INPUT: "INVALID_INPUT",
  ERROR: "ERROR",
} as const;
