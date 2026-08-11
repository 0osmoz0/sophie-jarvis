/**
 * Phase 25 — Mock AX focus reader for tests.
 */
import type {
  FocusReader,
  FocusWindowReadResult,
} from "../../context/EnvironmentObservation.js";
import type { EnvAvailability } from "../../context/EnvironmentContext.js";

export class MockFocusReader implements FocusReader {
  readonly name = "mock-ax-focus";
  private window: FocusWindowReadResult | null = {
    id: "ax-w1",
    title: "Mock Focus",
    applicationName: "Safari",
    bundleId: "com.apple.Safari",
    bounds: { x: 0, y: 25, width: 800, height: 600 },
  };
  private status: EnvAvailability = "AVAILABLE";

  setWindow(w: FocusWindowReadResult | null): void {
    this.window = w ? { ...w, bounds: w.bounds ? { ...w.bounds } : null } : null;
  }

  setStatus(s: EnvAvailability): void {
    this.status = s;
  }

  getCapability(): { status: EnvAvailability; reason?: string | null } {
    return { status: this.status, reason: null };
  }

  read(): FocusWindowReadResult | null {
    if (this.status !== "AVAILABLE") return null;
    return this.window ? { ...this.window, bounds: this.window.bounds ? { ...this.window.bounds } : null } : null;
  }
}
