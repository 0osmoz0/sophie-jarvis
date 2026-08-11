/**
 * Severity hysteresis — prevents INFO↔CRITICAL flicker between ticks.
 * Conservative: escalate slowly, decay slowly.
 */
import type { SecuritySeverity } from "./types.js";
import { SEVERITY_ORDER } from "./types.js";

export class SeverityStabilizer {
  private stabilized: SecuritySeverity = "INFO";
  private pendingUp: SecuritySeverity | null = null;
  private pendingUpCount = 0;
  private quietCount = 0;

  constructor(
    private readonly escalateConfirmations: number = 2,
    private readonly decayQuietTicks: number = 3,
  ) {}

  stabilize(raw: SecuritySeverity): SecuritySeverity {
    const rawN = SEVERITY_ORDER[raw];
    const curN = SEVERITY_ORDER[this.stabilized];

    if (rawN > curN) {
      this.quietCount = 0;
      // Cap single-step jump unless already confirming
      const stepTarget = stepUp(this.stabilized);
      const target = SEVERITY_ORDER[raw] > SEVERITY_ORDER[stepTarget] ? stepTarget : raw;

      if (this.pendingUp === target) {
        this.pendingUpCount += 1;
      } else {
        this.pendingUp = target;
        this.pendingUpCount = 1;
      }

      if (this.pendingUpCount >= this.escalateConfirmations) {
        this.stabilized = target;
        this.pendingUp = null;
        this.pendingUpCount = 0;
      }
      return this.stabilized;
    }

    this.pendingUp = null;
    this.pendingUpCount = 0;

    if (rawN < curN) {
      this.quietCount += 1;
      if (this.quietCount >= this.decayQuietTicks) {
        this.stabilized = stepDown(this.stabilized);
        this.quietCount = 0;
      }
      return this.stabilized;
    }

    this.quietCount = 0;
    return this.stabilized;
  }

  current(): SecuritySeverity {
    return this.stabilized;
  }

  reset(): void {
    this.stabilized = "INFO";
    this.pendingUp = null;
    this.pendingUpCount = 0;
    this.quietCount = 0;
  }
}

function stepUp(level: SecuritySeverity): SecuritySeverity {
  const order: SecuritySeverity[] = [
    "INFO",
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
  ];
  const i = order.indexOf(level);
  return order[Math.min(order.length - 1, i + 1)]!;
}

function stepDown(level: SecuritySeverity): SecuritySeverity {
  const order: SecuritySeverity[] = [
    "INFO",
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
  ];
  const i = order.indexOf(level);
  return order[Math.max(0, i - 1)]!;
}
