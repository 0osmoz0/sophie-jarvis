/**
 * Alert deduplication — one fingerprint per cooldown window.
 * Tracks firstSeen / lastSeen / occurrences. No sensitive content.
 */
import type { SecurityAlert, SecuritySeverity } from "./types.js";
import type { DedupedSecurityAlert } from "./monitorTypes.js";

const MAX_DEDUP_ENTRIES = 64;

export class SecurityAlertDeduper {
  private cooldownMs: number;
  private readonly entries = new Map<string, DedupedSecurityAlert>();
  private readonly order: string[] = [];

  constructor(
    cooldownMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.cooldownMs = cooldownMs;
  }

  setCooldown(ms: number): void {
    this.cooldownMs = Math.max(0, ms);
  }

  /**
   * Returns the alert to emit (new or updated), or null if suppressed.
   */
  consider(alert: SecurityAlert): {
    emit: DedupedSecurityAlert | null;
    suppressed: boolean;
    entry: DedupedSecurityAlert;
  } {
    const fingerprint = fingerprintAlert(alert);
    const t = this.now();
    const existing = this.entries.get(fingerprint);

    if (existing && t - existing.lastSeen < this.cooldownMs) {
      existing.lastSeen = t;
      existing.occurrences += 1;
      existing.level = higher(existing.level, alert.level);
      existing.confidence = Math.max(existing.confidence, alert.confidence);
      existing.summary = alert.summary;
      existing.reasons = [...alert.reasons];
      existing.evidence = [...alert.evidence];
      existing.requiresUserAttention =
        existing.requiresUserAttention || alert.requiresUserAttention;
      return { emit: null, suppressed: true, entry: cloneEntry(existing) };
    }

    const entry: DedupedSecurityAlert = {
      ...alert,
      evidence: [...alert.evidence],
      reasons: [...alert.reasons],
      firstSeen: existing?.firstSeen ?? t,
      lastSeen: t,
      occurrences: (existing?.occurrences ?? 0) + 1,
      fingerprint,
    };
    this.entries.set(fingerprint, entry);
    if (!this.order.includes(fingerprint)) this.order.push(fingerprint);
    while (this.order.length > MAX_DEDUP_ENTRIES) {
      const old = this.order.shift();
      if (old) this.entries.delete(old);
    }
    return { emit: cloneEntry(entry), suppressed: false, entry: cloneEntry(entry) };
  }

  list(): DedupedSecurityAlert[] {
    return this.order
      .map((fp) => this.entries.get(fp))
      .filter((e): e is DedupedSecurityAlert => !!e)
      .map(cloneEntry);
  }

  clear(): void {
    this.entries.clear();
    this.order.length = 0;
  }
}

export function fingerprintAlert(alert: SecurityAlert): string {
  const reasonKey = alert.reasons.slice(0, 2).join("|").slice(0, 120);
  // Level intentionally excluded — severity hysteresis must not bypass dedup.
  return `${alert.category}|${reasonKey}`;
}

function higher(a: SecuritySeverity, b: SecuritySeverity): SecuritySeverity {
  const order: SecuritySeverity[] = [
    "INFO",
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
  ];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function cloneEntry(e: DedupedSecurityAlert): DedupedSecurityAlert {
  return {
    ...e,
    reasons: [...e.reasons],
    evidence: [...e.evidence],
  };
}
