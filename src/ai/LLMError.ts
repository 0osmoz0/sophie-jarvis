/**
 * Phase 22 — LLM error taxonomy (metadata only, no secrets).
 */

export type LLMErrorCode =
  | "LLM_UNAVAILABLE"
  | "LLM_CONNECTION_FAILED"
  | "LLM_TIMEOUT"
  | "LLM_HTTP_ERROR"
  | "LLM_MODEL_NOT_FOUND"
  | "LLM_EMPTY_RESPONSE"
  | "LLM_INVALID_JSON"
  | "LLM_INVALID_SCHEMA"
  | "LLM_RESPONSE_TOO_LARGE"
  | "LLM_INTERRUPTED"
  | "LLM_RATE_LIMITED"
  | "LLM_SERVER_ERROR"
  | "LLM_CIRCUIT_OPEN"
  | "LLM_UNKNOWN_ERROR";

export interface LLMError {
  code: LLMErrorCode;
  provider: string;
  retryable: boolean;
  /** Safe user/log message — never prompt/response/secrets. */
  message: string;
  statusCode?: number;
  latencyMs?: number;
  attempt?: number;
}

export function createLLMError(
  partial: Omit<LLMError, "message"> & { message: string },
): LLMError {
  return {
    ...partial,
    message: sanitizeLlmMessage(partial.message),
  };
}

export function sanitizeLlmMessage(message: string): string {
  return message
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160)
    .replace(/password[=:].*/gi, "password=[redacted]")
    .replace(/api[_-]?key[=:].*/gi, "apiKey=[redacted]")
    .replace(/token[=:].*/gi, "token=[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

/** Map LLMErrorCode → legacy LLMProviderStatus for IntentRouter compatibility. */
export function errorCodeToStatus(
  code: LLMErrorCode,
): "UNAVAILABLE" | "TIMEOUT" | "INVALID_RESPONSE" | "ERROR" {
  switch (code) {
    case "LLM_TIMEOUT":
      return "TIMEOUT";
    case "LLM_UNAVAILABLE":
    case "LLM_CONNECTION_FAILED":
    case "LLM_MODEL_NOT_FOUND":
    case "LLM_CIRCUIT_OPEN":
      return "UNAVAILABLE";
    case "LLM_EMPTY_RESPONSE":
    case "LLM_INVALID_JSON":
    case "LLM_INVALID_SCHEMA":
    case "LLM_RESPONSE_TOO_LARGE":
      return "INVALID_RESPONSE";
    case "LLM_INTERRUPTED":
    case "LLM_HTTP_ERROR":
    case "LLM_RATE_LIMITED":
    case "LLM_SERVER_ERROR":
    case "LLM_UNKNOWN_ERROR":
    default:
      return "ERROR";
  }
}

export function classifyHttpStatus(status: number): {
  code: LLMErrorCode;
  retryable: boolean;
  message: string;
} {
  if (status === 404) {
    return {
      code: "LLM_MODEL_NOT_FOUND",
      retryable: false,
      message: "Ollama model or endpoint not found",
    };
  }
  if (status === 408) {
    return {
      code: "LLM_TIMEOUT",
      retryable: true,
      message: "Ollama HTTP timeout",
    };
  }
  if (status === 429) {
    return {
      code: "LLM_RATE_LIMITED",
      retryable: true,
      message: "Ollama rate limited",
    };
  }
  if (status >= 500 && status <= 504) {
    return {
      code: "LLM_SERVER_ERROR",
      retryable: true,
      message: `Ollama server error HTTP ${status}`,
    };
  }
  return {
    code: "LLM_HTTP_ERROR",
    retryable: false,
    message: `Ollama HTTP ${status}`,
  };
}

export function classifyNetworkError(err: unknown): LLMError {
  if (err instanceof Error && err.name === "AbortError") {
    return createLLMError({
      code: "LLM_TIMEOUT",
      provider: "ollama",
      retryable: true,
      message: "Ollama request timed out or was aborted",
    });
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|fetch failed|network/i.test(message)) {
    return createLLMError({
      code: "LLM_CONNECTION_FAILED",
      provider: "ollama",
      retryable: true,
      message: "Ollama connection failed",
    });
  }
  return createLLMError({
    code: "LLM_UNKNOWN_ERROR",
    provider: "ollama",
    retryable: false,
    message: "Ollama request failed",
  });
}
