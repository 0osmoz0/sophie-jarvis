/**
 * Phase 26 — SophieEnvironmentConsumer
 * EnvironmentContext → SophieEnvironmentSnapshot (read-only consumption).
 *
 * NEVER: animations, DecisionEngine, ActionExecutor, Memory,
 * permanent polling, or behavioral brain modules.
 */

import type { CursorContext } from "./CursorContext.js";
import {
  CURSOR_DEFAULTS,
  CursorProximityPolicy,
} from "./CursorContext.js";
import type {
  EnvironmentApplicationSection,
  EnvironmentChange,
  EnvironmentContext,
  EnvironmentScreenSection,
  EnvironmentSessionSection,
  EnvironmentSnapshotResult,
  EnvironmentWindowSection,
  FreshnessStatus,
} from "./EnvironmentContext.js";
import type { FocusedWindowContext } from "./FocusedWindowContext.js";
import type { SophieEnvironmentAnchor } from "./SophieEnvironmentAnchor.js";
import {
  emptySophieAnchor,
  type SophieAnchorProvider,
  UnavailableSophieAnchorProvider,
  SOPHIE_EDGE_DEFAULTS,
} from "./SophieEnvironmentAnchor.js";
import {
  computeSophieCursorRelation,
  emptySophieCursorRelation,
  type SophieCursorRelation,
} from "./SophieCursorRelation.js";
import {
  computeSophieEdges,
  emptySophieEdgeContext,
  type SophieEdgeContext,
} from "./SophieEdgeContext.js";
import {
  emptySophieSurfaceContext,
  type SophieSurfaceContext,
} from "./SophieSurfaceContext.js";
import {
  deriveSophieEnvironmentSignals,
  type SophieEnvironmentSignals,
} from "./SophieEnvironmentSignals.js";
import type { ContextService } from "./ContextService.js";

export interface SophieEnvironmentSnapshot {
  observedAt: number;
  freshness: FreshnessStatus;
  anchor: SophieEnvironmentAnchor;
  cursor: CursorContext;
  relation: SophieCursorRelation;
  edges: SophieEdgeContext;
  screen: EnvironmentScreenSection;
  window: EnvironmentWindowSection;
  focusedWindow: FocusedWindowContext;
  application: EnvironmentApplicationSection;
  session: EnvironmentSessionSection;
  surface: SophieSurfaceContext;
  signals: SophieEnvironmentSignals;
  changes: EnvironmentChange[];
}

export interface SophieEnvironmentConsumerOptions {
  anchorProvider?: SophieAnchorProvider;
  nearbyDistancePx?: number;
  leavingDistancePx?: number;
  nearEdgePx?: number;
  nearCornerPx?: number;
}

export class SophieEnvironmentConsumer {
  private readonly anchorProvider: SophieAnchorProvider;
  private readonly nearbyDistancePx: number;
  private readonly leavingDistancePx: number;
  private readonly nearEdgePx: number;
  private readonly nearCornerPx: number;
  private previousDistance: number | null = null;

  constructor(options: SophieEnvironmentConsumerOptions = {}) {
    this.anchorProvider =
      options.anchorProvider ?? new UnavailableSophieAnchorProvider();
    this.nearbyDistancePx =
      options.nearbyDistancePx ?? CURSOR_DEFAULTS.nearbyDistancePx;
    this.leavingDistancePx =
      options.leavingDistancePx ?? CURSOR_DEFAULTS.leavingDistancePx;
    this.nearEdgePx = options.nearEdgePx ?? SOPHIE_EDGE_DEFAULTS.nearEdgePx;
    this.nearCornerPx = options.nearCornerPx ?? SOPHIE_EDGE_DEFAULTS.nearCornerPx;
  }

  getAnchorProvider(): SophieAnchorProvider {
    return this.anchorProvider;
  }

  /**
   * Consume an existing EnvironmentContext snapshot (on-demand).
   * Does not poll. Does not act.
   */
  consume(
    envResult: EnvironmentSnapshotResult,
  ): SophieEnvironmentSnapshot {
    const now = envResult.environment.timestamp;
    const environment = envResult.environment;
    const anchor = this.anchorProvider.read(now);
    const relation = computeSophieCursorRelation(environment.cursor, anchor, {
      nearbyDistancePx: this.nearbyDistancePx,
      leavingDistancePx: this.leavingDistancePx,
      previousDistance: this.previousDistance,
    });
    if (relation.distance != null) {
      this.previousDistance = relation.distance;
    }

    const edges = computeSophieEdges(
      anchor,
      environment.screen,
      this.nearEdgePx,
      this.nearCornerPx,
    );
    const surface = emptySophieSurfaceContext();
    const signals = deriveSophieEnvironmentSignals({
      environment,
      relation,
      edges,
      surface,
      changes: envResult.changes,
    });

    return {
      observedAt: now,
      freshness: environment.freshness.status,
      anchor,
      cursor: environment.cursor,
      relation,
      edges,
      screen: environment.screen,
      window: environment.window,
      focusedWindow: environment.focusedWindow,
      application: environment.application,
      session: environment.session,
      surface,
      signals,
      changes: [...envResult.changes],
    };
  }

  /**
   * Unique API: EnvironmentContext → Sophie-consumable snapshot via ContextService.
   */
  async getSophieEnvironmentSnapshot(
    contextService: ContextService,
  ): Promise<SophieEnvironmentSnapshot> {
    const envResult = await contextService.getEnvironmentSnapshot();
    return this.consume(envResult);
  }

  /** Proximity policy for ContextService when anchor is available. */
  toCursorProximityPolicy(): CursorProximityPolicy {
    const a = this.anchorProvider.read();
    return new CursorProximityPolicy({
      nearbyDistancePx: this.nearbyDistancePx,
      leavingDistancePx: this.leavingDistancePx,
      sophiePosition:
        a.available && a.x != null && a.y != null
          ? {
              x: a.x + (a.width ?? 0) / 2,
              y: a.y + (a.height ?? 0) / 2,
            }
          : null,
    });
  }

  resetMotionMemory(): void {
    this.previousDistance = null;
  }
}

export function emptySophieEnvironmentSnapshot(
  now = Date.now(),
): SophieEnvironmentSnapshot {
  const emptyCursor = {
    available: "UNAVAILABLE" as const,
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
    freshness: { observedAt: null, ageMs: null, status: "UNKNOWN" as const },
    reason: "empty",
  };
  return {
    observedAt: now,
    freshness: "UNKNOWN",
    anchor: emptySophieAnchor(now),
    cursor: emptyCursor,
    relation: emptySophieCursorRelation(),
    edges: emptySophieEdgeContext(),
    screen: {
      available: "UNAVAILABLE",
      observedAt: null,
      source: "none",
      displays: [],
      primaryDisplay: null,
      width: null,
      height: null,
      scaleFactor: null,
      displayCount: 0,
      globalBounds: null,
    },
    window: {
      available: "UNAVAILABLE",
      observedAt: null,
      source: "none",
      active: null,
      titleAvailable: false,
      boundsAvailable: false,
    },
    focusedWindow: {
      available: "UNAVAILABLE",
      observedAt: null,
      source: "none",
      accessibilityAvailable: null,
      focused: null,
      heuristic: null,
      matchesHeuristic: null,
      titleAvailable: false,
      boundsAvailable: false,
    },
    application: {
      available: "UNAVAILABLE",
      observedAt: null,
      source: "none",
      active: null,
      runningCount: null,
      recentApplications: [],
    },
    session: {
      available: "UNKNOWN",
      observedAt: null,
      source: "none",
      locked: null,
      userPresent: null,
    },
    surface: emptySophieSurfaceContext(),
    signals: {
      cursorNear: null,
      cursorMoving: null,
      cursorApproaching: null,
      cursorLeaving: null,
      nearLeftEdge: null,
      nearRightEdge: null,
      nearTopEdge: null,
      nearBottomEdge: null,
      nearCorner: null,
      onValidSurface: null,
      inVoid: null,
      nearWindow: null,
      nearPerch: null,
      activeApplicationChanged: false,
      focusedWindowChanged: false,
      screenChanged: false,
      audioChanged: false,
      userActivityLevel: "UNKNOWN",
      sessionLocked: null,
    },
    changes: [],
  };
}
