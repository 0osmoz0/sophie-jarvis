import type { ProcessObservation } from "./types.js";

/**
 * ProcessObserver — READ ONLY.
 *
 * Portable full process listing in Node requires shell (`ps`) or native
 * bindings. Phase 2 forbids both, so this observer returns unavailable
 * rather than inventing data or spawning commands.
 *
 * Never kills, suspends, modifies, or launches processes.
 */
export class ProcessObserver {
  observe(): ProcessObservation {
    return {
      availability: "unavailable",
      reason:
        "Process listing is unavailable without shell or native bindings. Phase 2 prioritizes safety over data richness.",
      processes: null,
    };
  }
}
