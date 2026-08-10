import type { ApplicationObservation } from "./types.js";

/**
 * ApplicationObserver — READ ONLY.
 *
 * Listing open GUI apps / frontmost app on macOS typically needs AppleScript,
 * Accessibility, or native APIs. Phase 2 does not use AppleScript for control
 * or action, and does not add native bindings that could write.
 *
 * Returns unavailable / null — never invents application names.
 */
export class ApplicationObserver {
  observe(): ApplicationObservation {
    return {
      availability: "unavailable",
      reason:
        "Open-application enumeration requires AppleScript, Accessibility, or native APIs not enabled in Phase 2. Returning null rather than guessing.",
      applications: null,
      activeApplication: null,
    };
  }
}
