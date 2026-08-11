/**
 * Phase 22 — Ollama circuit breaker (LLM layer only — no authority).
 *
 * CLOSED → failures → OPEN → cooldown → HALF_OPEN → success → CLOSED
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface LLMCircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  enabled: boolean;
}

export const DEFAULT_CIRCUIT_BREAKER: LLMCircuitBreakerConfig = {
  failureThreshold: 3,
  cooldownMs: 10_000,
  enabled: true,
};

export class LLMCircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private readonly config: LLMCircuitBreakerConfig;
  private readonly now: () => number;

  constructor(
    config: Partial<LLMCircuitBreakerConfig> = {},
    now: () => number = () => Date.now(),
  ) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER, ...config };
    this.now = now;
  }

  getState(): CircuitState {
    this.maybeHalfOpen();
    return this.state;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /** Returns false when calls should short-circuit as unavailable. */
  allowRequest(): boolean {
    if (!this.config.enabled) return true;
    this.maybeHalfOpen();
    if (this.state === "OPEN") return false;
    return true;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "CLOSED";
  }

  recordFailure(): void {
    if (!this.config.enabled) return;
    this.consecutiveFailures += 1;
    if (
      this.state === "HALF_OPEN" ||
      this.consecutiveFailures >= this.config.failureThreshold
    ) {
      this.state = "OPEN";
      this.openedAt = this.now();
    }
  }

  private maybeHalfOpen(): void {
    if (this.state !== "OPEN") return;
    if (this.now() - this.openedAt >= this.config.cooldownMs) {
      this.state = "HALF_OPEN";
    }
  }
}
