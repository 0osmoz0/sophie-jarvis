/**
 * Phase 26 — Edge / corner observation relative to Sophie anchor + screen.
 * Observation only — never corrects Sophie position.
 */

import type { EnvironmentScreenSection } from "./EnvironmentContext.js";
import type { SophieEnvironmentAnchor } from "./SophieEnvironmentAnchor.js";
import { SOPHIE_EDGE_DEFAULTS, sophieBounds } from "./SophieEnvironmentAnchor.js";

export interface SophieEdgeContext {
  available: boolean;
  distanceLeft: number | null;
  distanceRight: number | null;
  distanceTop: number | null;
  distanceBottom: number | null;
  nearLeftEdge: boolean | null;
  nearRightEdge: boolean | null;
  nearTopEdge: boolean | null;
  nearBottomEdge: boolean | null;
  nearCorner: boolean | null;
  displayId: string | null;
  reason?: string | null;
}

export function emptySophieEdgeContext(
  reason = "Sophie anchor or screen unavailable",
): SophieEdgeContext {
  return {
    available: false,
    distanceLeft: null,
    distanceRight: null,
    distanceTop: null,
    distanceBottom: null,
    nearLeftEdge: null,
    nearRightEdge: null,
    nearTopEdge: null,
    nearBottomEdge: null,
    nearCorner: null,
    displayId: null,
    reason,
  };
}

/**
 * Cocoa bottom-left: y increases upward.
 * nearTop = close to top of display (high y), nearBottom = close to bottom (low y).
 */
export function computeSophieEdges(
  anchor: SophieEnvironmentAnchor,
  screen: EnvironmentScreenSection,
  nearEdgePx: number = SOPHIE_EDGE_DEFAULTS.nearEdgePx,
  nearCornerPx: number = SOPHIE_EDGE_DEFAULTS.nearCornerPx,
): SophieEdgeContext {
  const bounds = sophieBounds(anchor);
  if (!bounds) return emptySophieEdgeContext("Sophie anchor unavailable");
  if (screen.available !== "AVAILABLE" || screen.displays.length === 0) {
    return emptySophieEdgeContext("Screen unavailable");
  }

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  let display =
    screen.displays.find((d) => {
      const b = d.bounds;
      if (!b) return false;
      return (
        centerX >= b.x &&
        centerX < b.x + b.width &&
        centerY >= b.y &&
        centerY < b.y + b.height
      );
    }) ?? screen.primaryDisplay ?? screen.displays[0]!;

  const db = display.bounds;
  if (!db) return emptySophieEdgeContext("Display bounds unavailable");

  // Sophie rectangle edges vs display
  const distanceLeft = bounds.x - db.x;
  const distanceRight = db.x + db.width - (bounds.x + bounds.width);
  const distanceBottom = bounds.y - db.y;
  const distanceTop = db.y + db.height - (bounds.y + bounds.height);

  const nearLeftEdge = distanceLeft <= nearEdgePx;
  const nearRightEdge = distanceRight <= nearEdgePx;
  const nearBottomEdge = distanceBottom <= nearEdgePx;
  const nearTopEdge = distanceTop <= nearEdgePx;
  const nearCorner =
    (nearLeftEdge || nearRightEdge) &&
    (nearTopEdge || nearBottomEdge) &&
    Math.min(
      Math.abs(distanceLeft),
      Math.abs(distanceRight),
      Math.abs(distanceTop),
      Math.abs(distanceBottom),
    ) <= nearCornerPx;

  return {
    available: true,
    distanceLeft,
    distanceRight,
    distanceTop,
    distanceBottom,
    nearLeftEdge,
    nearRightEdge,
    nearTopEdge,
    nearBottomEdge,
    nearCorner,
    displayId: display.id,
    reason: null,
  };
}
