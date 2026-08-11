/**
 * Phase 21 — centralized error taxonomy (user-safe, no stack traces).
 */

export type JarvisErrorCategory =
  | "LLM_UNAVAILABLE"
  | "LLM_TIMEOUT"
  | "LLM_INVALID_RESPONSE"
  | "VALIDATION_FAILED"
  | "REFERENCE_AMBIGUOUS"
  | "DECISION_REFUSED"
  | "PLANNING_FAILED"
  | "PERMISSION_DENIED"
  | "CONFIRMATION_EXPIRED"
  | "CONFIRMATION_INVALID"
  | "EXECUTION_FAILED"
  | "CONTEXT_UNAVAILABLE"
  | "MEMORY_UNAVAILABLE"
  | "RESPONSE_FAILED"
  | "INTERNAL_ERROR"
  | "CONCURRENT_REQUEST";

export interface JarvisError {
  category: JarvisErrorCategory;
  code: string;
  stage: string;
  recoverable: boolean;
  userVisible: boolean;
  /** Safe message for logs / UI — never secrets or stack. */
  message: string;
  requestId: string | null;
  timestamp: string;
}

export function createJarvisError(
  partial: Omit<JarvisError, "timestamp"> & { timestamp?: string },
): JarvisError {
  return {
    ...partial,
    timestamp: partial.timestamp ?? new Date().toISOString(),
    message: sanitizeErrorMessage(partial.message),
  };
}

export function sanitizeErrorMessage(message: string): string {
  const trimmed = message.replace(/\s+/g, " ").trim().slice(0, 200);
  return trimmed
    .replace(/password[=:].*/gi, "password=[redacted]")
    .replace(/api[_-]?key[=:].*/gi, "apiKey=[redacted]")
    .replace(/token[=:].*/gi, "token=[redacted]");
}

/** Map common runtime / AI codes onto taxonomy categories. */
export function categorizeRuntimeCode(
  code: string | null | undefined,
): JarvisErrorCategory {
  const c = (code ?? "").toUpperCase();
  if (c.includes("TIMEOUT")) return "LLM_TIMEOUT";
  if (c.includes("UNAVAILABLE") && c.includes("LLM")) return "LLM_UNAVAILABLE";
  if (c === "UNAVAILABLE") return "CONTEXT_UNAVAILABLE";
  if (c.includes("INVALID") && c.includes("LLM")) return "LLM_INVALID_RESPONSE";
  if (c.includes("INVALID_INTENT") || c.includes("VALIDATION")) {
    return "VALIDATION_FAILED";
  }
  if (c.includes("DENIED") || c.includes("PERMISSION")) {
    return "PERMISSION_DENIED";
  }
  if (c.includes("EXPIRED")) return "CONFIRMATION_EXPIRED";
  if (c.includes("CONFIRM")) return "CONFIRMATION_INVALID";
  if (c.includes("PLAN")) return "PLANNING_FAILED";
  if (c.includes("EXEC") || c.includes("FAILED")) return "EXECUTION_FAILED";
  if (c.includes("MEMORY")) return "MEMORY_UNAVAILABLE";
  if (c.includes("CONTEXT")) return "CONTEXT_UNAVAILABLE";
  if (c.includes("CONCURRENT")) return "CONCURRENT_REQUEST";
  if (c.includes("REFUS")) return "DECISION_REFUSED";
  return "INTERNAL_ERROR";
}
