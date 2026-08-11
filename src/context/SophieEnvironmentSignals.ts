/**
 * Phase 26 — SophieEnvironmentSignals (observations only — not commands).
 */

import type { EnvironmentChange } from "./EnvironmentContext.js";
import type { UserActivityLevel } from "./EnvironmentContext.js";
import type { SophieCursorRelation } from "./SophieCursorRelation.js";
import type { SophieEdgeContext } from "./SophieEdgeContext.js";
import type { SophieSurfaceContext } from "./SophieSurfaceContext.js";
import type { CursorContext } from "./CursorContext.js";
import type { EnvironmentContext } from "./EnvironmentContext.js";

export interface SophieEnvironmentSignals {
  cursorNear: boolean | null;
  cursorMoving: boolean | null;
  cursorApproaching: boolean | null;
  cursorLeaving: boolean | null;

  nearLeftEdge: boolean | null;
  nearRightEdge: boolean | null;
  nearTopEdge: boolean | null;
  nearBottomEdge: boolean | null;
  nearCorner: boolean | null;

  onValidSurface: boolean | null;
  inVoid: boolean | null;

  nearWindow: boolean | null;
  nearPerch: boolean | null;

  activeApplicationChanged: boolean;
  focusedWindowChanged: boolean;
  screenChanged: boolean;
  audioChanged: boolean;

  userActivityLevel: UserActivityLevel;
  sessionLocked: boolean | null;
}

export function deriveSophieEnvironmentSignals(input: {
  environment: EnvironmentContext;
  relation: SophieCursorRelation;
  edges: SophieEdgeContext;
  surface: SophieSurfaceContext;
  changes: readonly EnvironmentChange[];
}): SophieEnvironmentSignals {
  const { environment, relation, edges, surface, changes } = input;
  const cursor: CursorContext = environment.cursor;
  const types = new Set(changes.map((c) => c.type));

  return {
    cursorNear: relation.near,
    cursorMoving: cursor.moving,
    cursorApproaching: relation.approaching,
    cursorLeaving: relation.leaving,

    nearLeftEdge: edges.nearLeftEdge,
    nearRightEdge: edges.nearRightEdge,
    nearTopEdge: edges.nearTopEdge,
    nearBottomEdge: edges.nearBottomEdge,
    nearCorner: edges.nearCorner,

    onValidSurface: surface.onValidSurface,
    inVoid: surface.inVoid,
    nearWindow: surface.nearWindow,
    nearPerch: surface.nearPerch,

    activeApplicationChanged:
      types.has("ACTIVE_APPLICATION_CHANGED") ||
      types.has("APPLICATION_CHANGED"),
    focusedWindowChanged: types.has("FOCUSED_WINDOW_CHANGED"),
    screenChanged: types.has("SCREEN_CHANGED"),
    audioChanged:
      types.has("AUDIO_STATE_CHANGED") ||
      types.has("AUDIO_PLAYBACK_STARTED") ||
      types.has("AUDIO_PLAYBACK_STOPPED") ||
      types.has("AUDIO_TRACK_CHANGED"),

    userActivityLevel: environment.userActivity.activityLevel,
    sessionLocked: environment.session.locked,
  };
}
