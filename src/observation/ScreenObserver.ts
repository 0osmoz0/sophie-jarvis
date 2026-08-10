import type { ScreenSnapshot } from "./types.js";

/**
 * ScreenObserver — Phase 2 scaffolding only.
 *
 * Does NOT capture the screen.
 * Does NOT request Screen Recording permission.
 * Does NOT allocate image buffers.
 *
 * Display geometry would need native / Electron APIs; without them,
 * available = false and dimensions are omitted (not invented).
 */
export class ScreenObserver {
  observe(): ScreenSnapshot {
    return {
      available: false,
      imageData: null,
      reason:
        "Screen capture and display enumeration are disabled in Phase 2. No Screen Recording permission is requested.",
    };
  }
}
