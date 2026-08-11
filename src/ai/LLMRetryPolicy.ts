/**
 * Phase 22 — controlled retry policy for Ollama (no infinite loops).
 */

import type { LLMError, LLMErrorCode } from "./LLMError.js";

export interface LLMRetryPolicyConfig {
  /** Total attempts including the first (default 2). */
  maxAttempts: number;
  /** Backoff delays between attempts in ms (bounded). */
  backoffMs: number[];
  /** Hard cap on any single backoff. */
  maxBackoffMs: number;
}

export const DEFAULT_LLM_RETRY_POLICY: LLMRetryPolicyConfig = {
  maxAttempts: 2,
  backoffMs: [100, 200],
  maxBackoffMs: 500,
};

const RETRYABLE_CODES = new Set<LLMErrorCode>([
  "LLM_TIMEOUT",
  "LLM_CONNECTION_FAILED",
  "LLM_UNAVAILABLE",
  "LLM_RATE_LIMITED",
  "LLM_SERVER_ERROR",
  "LLM_HTTP_ERROR", // only when classifyHttpStatus marked retryable
]);

const NON_RETRYABLE_CODES = new Set<LLMErrorCode>([
  "LLM_INVALID_JSON",
  "LLM_INVALID_SCHEMA",
  "LLM_EMPTY_RESPONSE",
  "LLM_RESPONSE_TOO_LARGE",
  "LLM_MODEL_NOT_FOUND",
  "LLM_INTERRUPTED",
  "LLM_CIRCUIT_OPEN",
  "LLM_UNKNOWN_ERROR",
]);

export class LLMRetryPolicy {
  readonly config: LLMRetryPolicyConfig;

  constructor(config: Partial<LLMRetryPolicyConfig> = {}) {
    this.config = {
      ...DEFAULT_LLM_RETRY_POLICY,
      ...config,
      maxAttempts: Math.max(
        1,
        Math.min(5, config.maxAttempts ?? DEFAULT_LLM_RETRY_POLICY.maxAttempts),
      ),
    };
  }

  /**
   * attempt is 1-based index of the attempt that just failed.
   * Returns true if another attempt should be made.
   */
  shouldRetry(error: LLMError, attempt: number): boolean {
    if (attempt >= this.config.maxAttempts) return false;
    if (NON_RETRYABLE_CODES.has(error.code)) return false;
    if (!error.retryable) return false;
    if (error.code === "LLM_HTTP_ERROR" && !error.retryable) return false;
    if (RETRYABLE_CODES.has(error.code) || error.retryable) return true;
    return false;
  }

  backoffForAttempt(failedAttempt: number): number {
    const idx = Math.max(0, failedAttempt - 1);
    const raw =
      this.config.backoffMs[idx] ??
      this.config.backoffMs[this.config.backoffMs.length - 1] ??
      100;
    return Math.min(raw, this.config.maxBackoffMs);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
