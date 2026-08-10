import type { UserActivityObservation } from "./types.js";

/**
 * UserActivityObserver — ACTIVE / IDLE / UNKNOWN only.
 *
 * Does NOT record key content, key codes, typed text, or window contents.
 * macOS idle time (CGEventSourceSecondsSinceLastEventType) needs native
 * bindings; shell workarounds are forbidden. Phase 2 therefore returns UNKNOWN.
 */
export class UserActivityObserver {
  observe(): UserActivityObservation {
    return {
      availability: "unavailable",
      reason:
        "User idle/active detection requires native input APIs not enabled in Phase 2. State is UNKNOWN (not invented).",
      state: "UNKNOWN",
      lastActivityAt: null,
      idleDurationMs: null,
      recordsKeyContent: false,
      recordsMouseCoordinates: false,
    };
  }
}
