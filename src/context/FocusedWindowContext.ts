/**
 * Phase 25 — Focused window context (AX vs heuristic).
 */

import type { EnvAvailability, EnvWindowRef } from "./EnvironmentContext.js";

export type FocusWindowSource =
  | "accessibility"
  | "cgwindow-heuristic"
  | "none";

export interface FocusedWindowContext {
  available: EnvAvailability;
  observedAt: number | null;
  source: FocusWindowSource;
  /** AX path succeeded (permission granted + data). */
  accessibilityAvailable: boolean | null;
  /** Best-effort focused window (AX when available). */
  focused: EnvWindowRef | null;
  /** Phase 24 CGWindowList heuristic (retained for comparison). */
  heuristic: EnvWindowRef | null;
  /** true/false when both present; null if incomparable. */
  matchesHeuristic: boolean | null;
  titleAvailable: boolean;
  boundsAvailable: boolean;
  reason?: string | null;
}

export function emptyFocusedWindowContext(): FocusedWindowContext {
  return {
    available: "UNAVAILABLE",
    observedAt: null,
    source: "none",
    accessibilityAvailable: null,
    focused: null,
    heuristic: null,
    matchesHeuristic: null,
    titleAvailable: false,
    boundsAvailable: false,
    reason: "No focus source",
  };
}

export function compareFocusWindows(
  ax: EnvWindowRef | null,
  heuristic: EnvWindowRef | null,
): boolean | null {
  if (!ax || !heuristic) return null;
  if (ax.id && heuristic.id && ax.id === heuristic.id) return true;
  const aApp = (ax.applicationName ?? "").toLowerCase();
  const hApp = (heuristic.applicationName ?? "").toLowerCase();
  if (aApp && hApp && aApp === hApp) {
    const aTitle = (ax.title ?? "").trim();
    const hTitle = (heuristic.title ?? "").trim();
    if (!aTitle || !hTitle) return null;
    return aTitle === hTitle;
  }
  return false;
}
