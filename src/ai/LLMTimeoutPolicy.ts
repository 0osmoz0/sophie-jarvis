/**
 * Phase 22 — explicit timeout policy for understand vs generateResponse.
 */

export interface LLMTimeoutPolicy {
  understandTimeoutMs: number;
  responseTimeoutMs: number;
}

export const DEFAULT_LLM_TIMEOUT_POLICY: LLMTimeoutPolicy = {
  /** Documented default: 15s for intent understanding. */
  understandTimeoutMs: 15_000,
  /** Documented default: 12s for wording generation. */
  responseTimeoutMs: 12_000,
};

export function resolveTimeoutPolicy(
  partial?: Partial<LLMTimeoutPolicy> & { timeoutMs?: number },
): LLMTimeoutPolicy {
  const envUnderstand = Number(process.env.JARVIS_OLLAMA_UNDERSTAND_TIMEOUT_MS);
  const envResponse = Number(process.env.JARVIS_OLLAMA_RESPONSE_TIMEOUT_MS);
  const envLegacy = Number(process.env.JARVIS_OLLAMA_TIMEOUT_MS);

  const fallback =
    partial?.timeoutMs ??
    (Number.isFinite(envLegacy) && envLegacy > 0
      ? envLegacy
      : DEFAULT_LLM_TIMEOUT_POLICY.understandTimeoutMs);

  return {
    understandTimeoutMs:
      partial?.understandTimeoutMs ??
      (Number.isFinite(envUnderstand) && envUnderstand > 0
        ? envUnderstand
        : fallback),
    responseTimeoutMs:
      partial?.responseTimeoutMs ??
      (Number.isFinite(envResponse) && envResponse > 0
        ? envResponse
        : Math.min(fallback, DEFAULT_LLM_TIMEOUT_POLICY.responseTimeoutMs)),
  };
}
