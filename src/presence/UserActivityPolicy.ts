import { RiskLevel } from "../permissions/RiskLevel.js";

/**
 * UserActivityPolicy — read-only observation.
 * No security actions, captures, cameras, audio input, or alerts.
 */
export class UserActivityPolicy {
  private readsAllowed = true;

  /** Test / ops helper — deny aggregate reads without enabling actions. */
  setReadsAllowed(allowed: boolean): void {
    this.readsAllowed = allowed;
  }

  riskFor(): RiskLevel {
    return RiskLevel.LOW;
  }

  allowsSecurityActions(): boolean {
    return false;
  }

  allowsAutomaticCapture(): boolean {
    return false;
  }

  allowsCamera(): boolean {
    return false;
  }

  /** Never allow audio input capture from presence layer. */
  allowsAudioInput(): boolean {
    return false;
  }

  allowsAutomaticAlerts(): boolean {
    return false;
  }

  evaluate(): { allowed: boolean; riskLevel: RiskLevel; reason?: string } {
    if (!this.readsAllowed) {
      return {
        allowed: false,
        riskLevel: RiskLevel.LOW,
        reason: "User activity reads denied by policy",
      };
    }
    return { allowed: true, riskLevel: RiskLevel.LOW };
  }
}
