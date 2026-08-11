/**
 * Phase 26 — Sophie position anchor (observation only).
 * No BehaviorBrain. No second coordinate system.
 */

import type { CursorCoordinateSpace } from "./CursorContext.js";
import type { ContextFreshness } from "./EnvironmentContext.js";
import { computeFreshness } from "./EnvironmentContext.js";

export interface SophieEnvironmentAnchor {
  available: boolean;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  coordinateSpace: CursorCoordinateSpace | "unknown";
  observedAt: number | null;
  source: string;
  freshness: ContextFreshness;
  reason?: string | null;
}

/**
 * Provider of Sophie geometry — must be an existing source of truth when wired.
 * Default: unavailable (this repo has no Sophie global position).
 */
export interface SophieAnchorProvider {
  readonly name: string;
  read(now?: number): SophieEnvironmentAnchor;
}

export const SOPHIE_EDGE_DEFAULTS = {
  nearEdgePx: 48,
  nearCornerPx: 64,
} as const;

export function emptySophieAnchor(now = Date.now()): SophieEnvironmentAnchor {
  return {
    available: false,
    x: null,
    y: null,
    width: null,
    height: null,
    coordinateSpace: "unknown",
    observedAt: null,
    source: "none",
    freshness: computeFreshness(null, now),
    reason:
      "No reliable Sophie global position in jarvis repo — SophiePublicSnapshot has no geometry",
  };
}

/** Explicit inject for tests / future external Sophie runtime. */
export class StaticSophieAnchorProvider implements SophieAnchorProvider {
  readonly name = "static-sophie-anchor";
  private anchor: SophieEnvironmentAnchor;

  constructor(anchor: Partial<SophieEnvironmentAnchor> & { x: number; y: number }) {
    const now = Date.now();
    this.anchor = {
      available: true,
      x: anchor.x,
      y: anchor.y,
      width: anchor.width ?? 120,
      height: anchor.height ?? 160,
      coordinateSpace: anchor.coordinateSpace ?? "cocoa-global-bottom-left",
      observedAt: anchor.observedAt ?? now,
      source: anchor.source ?? this.name,
      freshness: computeFreshness(anchor.observedAt ?? now, now),
      reason: null,
    };
  }

  setPosition(x: number, y: number, observedAt = Date.now()): void {
    this.anchor = {
      ...this.anchor,
      available: true,
      x,
      y,
      observedAt,
      freshness: computeFreshness(observedAt, observedAt),
      reason: null,
    };
  }

  setUnavailable(reason?: string): void {
    this.anchor = emptySophieAnchor();
    if (reason) this.anchor.reason = reason;
  }

  read(now = Date.now()): SophieEnvironmentAnchor {
    if (!this.anchor.available) return emptySophieAnchor(now);
    return {
      ...this.anchor,
      freshness: computeFreshness(this.anchor.observedAt, now),
    };
  }
}

export class UnavailableSophieAnchorProvider implements SophieAnchorProvider {
  readonly name = "unavailable-sophie-anchor";
  read(now = Date.now()): SophieEnvironmentAnchor {
    return emptySophieAnchor(now);
  }
}

export function sophieCenter(
  anchor: SophieEnvironmentAnchor,
): { x: number; y: number } | null {
  if (!anchor.available || anchor.x == null || anchor.y == null) return null;
  const w = anchor.width ?? 0;
  const h = anchor.height ?? 0;
  return { x: anchor.x + w / 2, y: anchor.y + h / 2 };
}

export function sophieBounds(anchor: SophieEnvironmentAnchor): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (!anchor.available || anchor.x == null || anchor.y == null) return null;
  return {
    x: anchor.x,
    y: anchor.y,
    width: Math.max(0, anchor.width ?? 0),
    height: Math.max(0, anchor.height ?? 0),
  };
}
