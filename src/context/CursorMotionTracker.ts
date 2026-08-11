/**
 * Phase 25 — bounded cursor sample history for motion (on-demand, not polling).
 */

import type { CursorSample } from "./CursorContext.js";

export class CursorMotionTracker {
  private previous: CursorSample | null = null;
  private lastProximityNearby: boolean | null = null;

  /** Record sample; returns previous for motion delta. */
  record(sample: CursorSample): CursorSample | null {
    const prev = this.previous;
    this.previous = { ...sample };
    return prev;
  }

  /** Track proximity enter/leave when Sophie anchor exists. */
  updateProximity(nearby: boolean | null): "enter" | "leave" | null {
    if (nearby == null) return null;
    const prev = this.lastProximityNearby;
    this.lastProximityNearby = nearby;
    if (prev == null) return null;
    if (!prev && nearby) return "enter";
    if (prev && !nearby) return "leave";
    return null;
  }

  reset(): void {
    this.previous = null;
    this.lastProximityNearby = null;
  }
}
