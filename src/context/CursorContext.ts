/**
 * Phase 25 — Cursor observation types + proximity policy (observation only).
 */

import type { ContextFreshness, EnvAvailability } from "./EnvironmentContext.js";
import { computeFreshness } from "./EnvironmentContext.js";

export type CursorCoordinateSpace =
  | "cocoa-global-bottom-left"
  | "unknown";

export interface CursorContext {
  available: EnvAvailability;
  observedAt: number | null;
  source: string;
  coordinateSpace: CursorCoordinateSpace | null;
  /** Global logical point (Cocoa bottom-left origin). */
  x: number | null;
  y: number | null;
  displayId: string | null;
  /** null = unknown (not false). */
  moving: boolean | null;
  velocity: number | null;
  direction: { x: number; y: number } | null;
  /** null = UNKNOWN — Sophie has no global anchor in Phase 25. */
  distanceToSophie: number | null;
  nearby: boolean | null;
  approaching: boolean | null;
  leaving: boolean | null;
  ageMs: number | null;
  freshness: ContextFreshness;
  reason?: string | null;
}

export interface CursorProximityPolicyOptions {
  nearbyDistancePx?: number;
  leavingDistancePx?: number;
  movementThresholdPx?: number;
  velocityWindowMs?: number;
  /** Only set when Sophie anchor is provably available — otherwise omit. */
  sophiePosition?: { x: number; y: number } | null;
}

export const CURSOR_DEFAULTS = {
  nearbyDistancePx: 120,
  leavingDistancePx: 180,
  movementThresholdPx: 3,
  velocityWindowMs: 250,
} as const;

export class CursorProximityPolicy {
  readonly nearbyDistancePx: number;
  readonly leavingDistancePx: number;
  readonly movementThresholdPx: number;
  readonly velocityWindowMs: number;
  readonly sophiePosition: { x: number; y: number } | null;

  constructor(options: CursorProximityPolicyOptions = {}) {
    this.nearbyDistancePx =
      options.nearbyDistancePx ?? CURSOR_DEFAULTS.nearbyDistancePx;
    this.leavingDistancePx =
      options.leavingDistancePx ?? CURSOR_DEFAULTS.leavingDistancePx;
    this.movementThresholdPx =
      options.movementThresholdPx ?? CURSOR_DEFAULTS.movementThresholdPx;
    this.velocityWindowMs =
      options.velocityWindowMs ?? CURSOR_DEFAULTS.velocityWindowMs;
    this.sophiePosition = options.sophiePosition ?? null;
  }

  hasSophieAnchor(): boolean {
    return this.sophiePosition != null;
  }
}

export interface CursorSample {
  x: number;
  y: number;
  observedAt: number;
}

export interface CursorMotionResult {
  moving: boolean | null;
  velocity: number | null;
  direction: { x: number; y: number } | null;
  distanceToSophie: number | null;
  nearby: boolean | null;
  approaching: boolean | null;
  leaving: boolean | null;
}

/**
 * Compute motion from two samples — never infers movement from a single point.
 */
export function computeCursorMotion(
  current: CursorSample | null,
  previous: CursorSample | null,
  policy: CursorProximityPolicy,
): CursorMotionResult {
  const unknownProximity: CursorMotionResult = {
    moving: null,
    velocity: null,
    direction: null,
    distanceToSophie: null,
    nearby: null,
    approaching: null,
    leaving: null,
  };

  if (!current || !Number.isFinite(current.x) || !Number.isFinite(current.y)) {
    return unknownProximity;
  }

  if (!previous) {
    return {
      ...unknownProximity,
      moving: null,
      distanceToSophie: policy.hasSophieAnchor()
        ? distance(current, policy.sophiePosition!)
        : null,
      nearby: policy.hasSophieAnchor()
        ? proximityBucket(current, policy).nearby
        : null,
      approaching: null,
      leaving: null,
    };
  }

  const dtMs = current.observedAt - previous.observedAt;
  if (dtMs <= 0 || dtMs > policy.velocityWindowMs * 4) {
    return unknownProximity;
  }

  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  const dist = Math.hypot(dx, dy);
  const moving = dist >= policy.movementThresholdPx;
  const velocity = dist / (dtMs / 1000);

  let direction: { x: number; y: number } | null = null;
  if (dist > 0) {
    direction = { x: dx / dist, y: dy / dist };
  }

  if (!policy.hasSophieAnchor()) {
    return {
      moving,
      velocity: moving ? velocity : 0,
      direction: moving ? direction : null,
      distanceToSophie: null,
      nearby: null,
      approaching: null,
      leaving: null,
    };
  }

  const prevDist = distance(previous, policy.sophiePosition!);
  const curDist = distance(current, policy.sophiePosition!);
  const prox = proximityBucket(current, policy);
  const approaching =
    curDist < prevDist - policy.movementThresholdPx ? true : curDist > prevDist ? false : null;
  const leaving =
    curDist > policy.leavingDistancePx
      ? true
      : curDist <= policy.nearbyDistancePx
        ? false
        : null;

  return {
    moving,
    velocity: moving ? velocity : 0,
    direction: moving ? direction : null,
    distanceToSophie: curDist,
    nearby: prox.nearby,
    approaching,
    leaving,
  };
}

export function emptyCursorContext(now = Date.now()): CursorContext {
  return {
    available: "UNAVAILABLE",
    observedAt: null,
    source: "none",
    coordinateSpace: null,
    x: null,
    y: null,
    displayId: null,
    moving: null,
    velocity: null,
    direction: null,
    distanceToSophie: null,
    nearby: null,
    approaching: null,
    leaving: null,
    ageMs: null,
    freshness: computeFreshness(null, now),
    reason: "Cursor API unavailable",
  };
}

export function mapMouseToDisplay(
  displays: Array<{
    id: string;
    bounds: { x: number; y: number; width: number; height: number } | null;
  }>,
  x: number,
  y: number,
): string | null {
  for (const d of displays) {
    const b = d.bounds;
    if (!b) continue;
    if (
      x >= b.x &&
      x < b.x + b.width &&
      y >= b.y &&
      y < b.y + b.height
    ) {
      return d.id;
    }
  }
  return null;
}

function distance(
  p: { x: number; y: number },
  q: { x: number; y: number },
): number {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

function proximityBucket(
  p: CursorSample,
  policy: CursorProximityPolicy,
): { nearby: boolean } {
  const d = distance(p, policy.sophiePosition!);
  return { nearby: d <= policy.nearbyDistancePx };
}
