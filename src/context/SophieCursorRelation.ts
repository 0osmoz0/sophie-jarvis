/**
 * Phase 26 — Sophie ↔ cursor relation (passive observation).
 * Never triggers animation / DecisionEngine / ActionExecutor.
 */

import type { CursorContext } from "./CursorContext.js";
import { CURSOR_DEFAULTS } from "./CursorContext.js";
import type { SophieEnvironmentAnchor } from "./SophieEnvironmentAnchor.js";
import {
  sophieBounds,
  sophieCenter,
} from "./SophieEnvironmentAnchor.js";

export interface SophieCursorRelation {
  available: boolean;
  distance: number | null;
  horizontalDistance: number | null;
  verticalDistance: number | null;
  cursorInsideBounds: boolean | null;
  near: boolean | null;
  approaching: boolean | null;
  leaving: boolean | null;
  reason?: string | null;
}

export interface SophieCursorRelationOptions {
  nearbyDistancePx?: number;
  leavingDistancePx?: number;
  movementThresholdPx?: number;
  /** Previous distance for approaching/leaving — null if unknown. */
  previousDistance?: number | null;
}

export function emptySophieCursorRelation(
  reason = "Cursor or Sophie anchor unavailable",
): SophieCursorRelation {
  return {
    available: false,
    distance: null,
    horizontalDistance: null,
    verticalDistance: null,
    cursorInsideBounds: null,
    near: null,
    approaching: null,
    leaving: null,
    reason,
  };
}

/**
 * Compute relation. If either side UNKNOWN → all booleans null (never false by default).
 */
export function computeSophieCursorRelation(
  cursor: CursorContext,
  anchor: SophieEnvironmentAnchor,
  options: SophieCursorRelationOptions = {},
): SophieCursorRelation {
  if (cursor.available !== "AVAILABLE" || cursor.x == null || cursor.y == null) {
    return emptySophieCursorRelation("Cursor unavailable");
  }
  if (!anchor.available || anchor.x == null || anchor.y == null) {
    return emptySophieCursorRelation("Sophie anchor unavailable");
  }
  if (
    cursor.coordinateSpace &&
    cursor.coordinateSpace !== "unknown" &&
    anchor.coordinateSpace !== "unknown" &&
    cursor.coordinateSpace !== anchor.coordinateSpace
  ) {
    return emptySophieCursorRelation(
      `Coordinate space mismatch: cursor=${cursor.coordinateSpace} sophie=${anchor.coordinateSpace}`,
    );
  }

  const center = sophieCenter(anchor)!;
  const dx = cursor.x - center.x;
  const dy = cursor.y - center.y;
  const distance = Math.hypot(dx, dy);
  const nearbyPx = options.nearbyDistancePx ?? CURSOR_DEFAULTS.nearbyDistancePx;
  const leavingPx = options.leavingDistancePx ?? CURSOR_DEFAULTS.leavingDistancePx;
  const moveThresh =
    options.movementThresholdPx ?? CURSOR_DEFAULTS.movementThresholdPx;

  const bounds = sophieBounds(anchor)!;
  const inside =
    cursor.x >= bounds.x &&
    cursor.x <= bounds.x + bounds.width &&
    cursor.y >= bounds.y &&
    cursor.y <= bounds.y + bounds.height;

  let approaching: boolean | null = null;
  let leaving: boolean | null = null;
  const prev = options.previousDistance;
  if (prev != null && Number.isFinite(prev)) {
    if (distance < prev - moveThresh) approaching = true;
    else if (distance > prev + moveThresh) approaching = false;
    if (distance > leavingPx && prev <= leavingPx) leaving = true;
    else if (distance <= nearbyPx && prev > nearbyPx) leaving = false;
  }

  return {
    available: true,
    distance,
    horizontalDistance: Math.abs(dx),
    verticalDistance: Math.abs(dy),
    cursorInsideBounds: inside,
    near: distance <= nearbyPx || inside,
    approaching,
    leaving,
    reason: null,
  };
}
