/**
 * Phase 25 — Mock cursor reader for tests.
 */
import type {
  CursorReadResult,
  CursorReader,
} from "../../context/EnvironmentObservation.js";
import type { EnvAvailability } from "../../context/EnvironmentContext.js";

export class MockCursorReader implements CursorReader {
  readonly name = "mock-cursor";
  private position: CursorReadResult | null = {
    x: 400,
    y: 300,
    coordinateSpace: "cocoa-global-bottom-left",
  };
  private unavailable = false;

  setPosition(x: number, y: number): void {
    this.position = {
      x,
      y,
      coordinateSpace: "cocoa-global-bottom-left",
    };
  }

  setUnavailable(v: boolean): void {
    this.unavailable = v;
  }

  getCapability(): { status: EnvAvailability; reason?: string | null } {
    if (this.unavailable) {
      return { status: "UNAVAILABLE", reason: "Mock unavailable" };
    }
    return { status: "AVAILABLE" };
  }

  read(): CursorReadResult | null {
    if (this.unavailable) return null;
    return this.position ? { ...this.position } : null;
  }
}
