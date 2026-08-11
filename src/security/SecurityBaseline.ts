/**
 * Bounded in-memory security baseline — session comparison only.
 * Phase 15: adaptive habitual-app learning (frequency only, no sensitive data).
 */
import type {
  SecurityBaselineSnapshot,
  SecurityObservationInput,
} from "./types.js";
import { appKey } from "./SecuritySignal.js";

const MAX_BASELINE_HISTORY = 8;
const MAX_APP_FREQUENCY_ENTRIES = 64;
const HABITUAL_THRESHOLD = 3;

export class SecurityBaseline {
  private current: SecurityBaselineSnapshot | null = null;
  private readonly history: SecurityBaselineSnapshot[] = [];
  /** Frequency of observed app keys this session — "habitual" learning. */
  private readonly appFrequency = new Map<string, number>();
  private readonly presenceTransitions: Array<{
    from: string;
    to: string;
    at: number;
  }> = [];
  private lastPresence: string | null = null;
  /** Keys informed by MemoryService preferences — never a security bypass. */
  private readonly informedHabitual = new Set<string>();

  getCurrent(): SecurityBaselineSnapshot | null {
    return this.current ? cloneBaseline(this.current) : null;
  }

  isReady(): boolean {
    return this.current !== null;
  }

  ageMs(now: number = Date.now()): number | null {
    if (!this.current) return null;
    return Math.max(0, now - this.current.timestamp);
  }

  /**
   * Seed or replace baseline from an observation (first call = establish normal).
   */
  updateFromObservation(obs: SecurityObservationInput): SecurityBaselineSnapshot {
    const snap = observationToBaseline(obs);
    this.current = snap;
    this.history.push(cloneBaseline(snap));
    while (this.history.length > MAX_BASELINE_HISTORY) {
      this.history.shift();
    }
    this.learnHabits(obs);
    return cloneBaseline(snap);
  }

  /**
   * Learn habitual patterns without absorbing a full anomalous snapshot.
   * Only increments frequency counters for apps currently observed.
   */
  learnHabits(obs: SecurityObservationInput): void {
    for (const app of obs.applications ?? []) {
      const key = appKey(app);
      if (!key) continue;
      const next = (this.appFrequency.get(key) ?? 0) + 1;
      this.appFrequency.set(key, next);
    }
    while (this.appFrequency.size > MAX_APP_FREQUENCY_ENTRIES) {
      // Drop lowest frequency
      let worst: string | null = null;
      let worstN = Infinity;
      for (const [k, n] of this.appFrequency) {
        if (n < worstN) {
          worst = k;
          worstN = n;
        }
      }
      if (worst) this.appFrequency.delete(worst);
      else break;
    }
  }

  /**
   * Mark keys informed by long-term memory (preferences).
   * Informs habitual detection only — NEVER bypasses security policy.
   */
  markInformedHabitual(keys: string[]): void {
    for (const k of keys) {
      const key = k.trim().toLowerCase();
      if (!key) continue;
      this.informedHabitual.add(key);
      // Also bump frequency lightly so isHabitualApp can trip
      const n = this.appFrequency.get(key) ?? 0;
      if (n < HABITUAL_THRESHOLD) {
        this.appFrequency.set(key, HABITUAL_THRESHOLD);
      }
    }
  }

  isHabitualApp(key: string): boolean {
    const lower = key.toLowerCase();
    if (this.informedHabitual.has(lower)) return true;
    for (const h of this.informedHabitual) {
      if (lower.includes(h) || h.includes(lower.replace(/^bundle:|^name:/, ""))) {
        return true;
      }
    }
    return (this.appFrequency.get(key) ?? 0) >= HABITUAL_THRESHOLD;
  }

  appSeenCount(key: string): number {
    return this.appFrequency.get(key) ?? 0;
  }

  recordPresence(presence: string, at: number): { from: string; to: string } | null {
    if (this.lastPresence && this.lastPresence !== presence) {
      const transition = { from: this.lastPresence, to: presence, at };
      this.presenceTransitions.push(transition);
      while (this.presenceTransitions.length > 16) {
        this.presenceTransitions.shift();
      }
      this.lastPresence = presence;
      return { from: transition.from, to: transition.to };
    }
    this.lastPresence = presence;
    return null;
  }

  listHistory(): readonly SecurityBaselineSnapshot[] {
    return this.history.map(cloneBaseline);
  }

  clear(): void {
    this.current = null;
    this.history.length = 0;
    this.appFrequency.clear();
    this.presenceTransitions.length = 0;
    this.lastPresence = null;
    this.informedHabitual.clear();
  }
}

export function observationToBaseline(
  obs: SecurityObservationInput,
): SecurityBaselineSnapshot {
  const applicationKeys = unique(
    (obs.applications ?? [])
      .map((a) => appKey(a))
      .filter((k): k is string => !!k),
  );
  const activeKey = obs.activeApplication
    ? appKey(obs.activeApplication)
    : null;
  const windowAppKeys = unique(
    (obs.windows ?? [])
      .map((w) =>
        w.applicationName
          ? `name:${w.applicationName.trim().toLowerCase()}`
          : null,
      )
      .filter((k): k is string => !!k),
  );
  const fileFingerprints = (obs.files ?? []).map((f) => ({
    key: f.key,
    mtimeMs: f.mtimeMs ?? null,
    size: f.size ?? null,
  }));

  return {
    timestamp: obs.timestamp,
    applicationKeys,
    activeKey,
    windowAppKeys,
    fileFingerprints,
    idleSeconds: obs.idleSeconds ?? null,
    memoryFreeBytes: obs.system?.memoryFreeBytes ?? null,
    uptimeSeconds: obs.system?.uptimeSeconds ?? null,
    applicationCount:
      obs.system?.applicationCount ?? applicationKeys.length,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function cloneBaseline(b: SecurityBaselineSnapshot): SecurityBaselineSnapshot {
  return {
    ...b,
    applicationKeys: [...b.applicationKeys],
    windowAppKeys: [...b.windowAppKeys],
    fileFingerprints: b.fileFingerprints.map((f) => ({ ...f })),
  };
}
