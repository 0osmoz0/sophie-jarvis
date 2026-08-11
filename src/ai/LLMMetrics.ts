/**
 * Phase 22 — bounded LLM metrics (metadata only).
 */

export interface LLMMetricsSnapshot {
  llmRequests: number;
  llmSuccesses: number;
  llmFailures: number;
  llmTimeouts: number;
  llmRetries: number;
  llmInvalidJson: number;
  llmInvalidSchema: number;
  llmModelNotFound: number;
  llmFallbacks: number;
  llmCircuitOpen: number;
  understand: { count: number; sumMs: number; maxMs: number };
  generateResponse: { count: number; sumMs: number; maxMs: number };
  lastErrorCode: string | null;
  lastSuccessfulRequestAt: string | null;
  consecutiveFailures: number;
}

function emptyLatency() {
  return { count: 0, sumMs: 0, maxMs: 0 };
}

export class LLMMetrics {
  private data: LLMMetricsSnapshot = {
    llmRequests: 0,
    llmSuccesses: 0,
    llmFailures: 0,
    llmTimeouts: 0,
    llmRetries: 0,
    llmInvalidJson: 0,
    llmInvalidSchema: 0,
    llmModelNotFound: 0,
    llmFallbacks: 0,
    llmCircuitOpen: 0,
    understand: emptyLatency(),
    generateResponse: emptyLatency(),
    lastErrorCode: null,
    lastSuccessfulRequestAt: null,
    consecutiveFailures: 0,
  };

  record(event: {
    operation: "understand" | "generateResponse";
    ok: boolean;
    latencyMs?: number | null;
    retried?: boolean;
    errorCode?: string | null;
    fallback?: boolean;
    circuitOpen?: boolean;
  }): void {
    this.data.llmRequests += 1;
    if (event.retried) this.data.llmRetries += 1;
    if (event.fallback) this.data.llmFallbacks += 1;
    if (event.circuitOpen) this.data.llmCircuitOpen += 1;

    const bucket =
      event.operation === "understand"
        ? this.data.understand
        : this.data.generateResponse;
    if (event.latencyMs != null && Number.isFinite(event.latencyMs)) {
      bucket.count += 1;
      bucket.sumMs += event.latencyMs;
      if (event.latencyMs > bucket.maxMs) bucket.maxMs = event.latencyMs;
    }

    if (event.ok) {
      this.data.llmSuccesses += 1;
      this.data.consecutiveFailures = 0;
      this.data.lastSuccessfulRequestAt = new Date().toISOString();
    } else {
      this.data.llmFailures += 1;
      this.data.consecutiveFailures += 1;
      this.data.lastErrorCode = event.errorCode ?? "LLM_UNKNOWN_ERROR";
      if (event.errorCode === "LLM_TIMEOUT") this.data.llmTimeouts += 1;
      if (event.errorCode === "LLM_INVALID_JSON") this.data.llmInvalidJson += 1;
      if (event.errorCode === "LLM_INVALID_SCHEMA") {
        this.data.llmInvalidSchema += 1;
      }
      if (event.errorCode === "LLM_MODEL_NOT_FOUND") {
        this.data.llmModelNotFound += 1;
      }
    }
  }

  getSnapshot(): LLMMetricsSnapshot {
    return structuredClone(this.data);
  }

  format(): string {
    const s = this.data;
    const lat = (b: { count: number; sumMs: number; maxMs: number }, name: string) => {
      if (b.count === 0) return `${name}: unavailable`;
      return `${name}: n=${b.count} avg=${(b.sumMs / b.count).toFixed(1)}ms max=${b.maxMs.toFixed(1)}ms`;
    };
    return [
      "=== JARVIS LLM METRICS ===",
      `requests: ${s.llmRequests}`,
      `successes: ${s.llmSuccesses}`,
      `failures: ${s.llmFailures}`,
      `timeouts: ${s.llmTimeouts}`,
      `retries: ${s.llmRetries}`,
      `invalidJson: ${s.llmInvalidJson}`,
      `invalidSchema: ${s.llmInvalidSchema}`,
      `modelNotFound: ${s.llmModelNotFound}`,
      `fallbacks: ${s.llmFallbacks}`,
      `circuitOpen: ${s.llmCircuitOpen}`,
      `lastErrorCode: ${s.lastErrorCode ?? "n/a"}`,
      `consecutiveFailures: ${s.consecutiveFailures}`,
      lat(s.understand, "understand"),
      lat(s.generateResponse, "generateResponse"),
    ].join("\n");
  }

  reset(): void {
    this.data = {
      llmRequests: 0,
      llmSuccesses: 0,
      llmFailures: 0,
      llmTimeouts: 0,
      llmRetries: 0,
      llmInvalidJson: 0,
      llmInvalidSchema: 0,
      llmModelNotFound: 0,
      llmFallbacks: 0,
      llmCircuitOpen: 0,
      understand: emptyLatency(),
      generateResponse: emptyLatency(),
      lastErrorCode: null,
      lastSuccessfulRequestAt: null,
      consecutiveFailures: 0,
    };
  }
}
