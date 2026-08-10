import { RiskLevel } from "../permissions/RiskLevel.js";
import type { ScreenAction } from "./types.js";

/**
 * ScreenPolicy — risk assignment for observation tools.
 * Capture is HIGH and must never be automatic/background.
 */
export class ScreenPolicy {
  riskFor(action: ScreenAction): RiskLevel {
    switch (action) {
      case "info":
      case "windows":
      case "activeWindow":
      case "session":
        return RiskLevel.LOW;
      case "capture":
        return RiskLevel.HIGH;
    }
  }

  /** Capture must be explicit — never from timers/background events. */
  allowsAutomaticCapture(): boolean {
    return false;
  }

  evaluate(action: ScreenAction): {
    allowed: boolean;
    riskLevel: RiskLevel;
    reason?: string;
  } {
    if (action === "capture" && this.allowsAutomaticCapture()) {
      return {
        allowed: false,
        riskLevel: RiskLevel.HIGH,
        reason: "Automatic capture is forbidden",
      };
    }
    return {
      allowed: true,
      riskLevel: this.riskFor(action),
    };
  }
}
