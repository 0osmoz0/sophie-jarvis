/**
 * Phase 25 — macOS cursor reader via native addon (NSEvent.mouseLocation).
 */
import { loadJarvisMacosAddon } from "./native/loadAddon.js";
import type {
  CursorReadResult,
  CursorReader,
} from "../../context/EnvironmentObservation.js";
import type { EnvAvailability } from "../../context/EnvironmentContext.js";

export class MacOSCursorReader implements CursorReader {
  readonly name = "macos-cursor";

  getCapability(): { status: EnvAvailability; reason?: string | null } {
    const addon = loadJarvisMacosAddon();
    if (!addon || typeof addon.getMouseLocation !== "function") {
      return {
        status: "UNAVAILABLE",
        reason: "Native addon missing getMouseLocation — rebuild build:native",
      };
    }
    return { status: "AVAILABLE", reason: null };
  }

  read(): CursorReadResult | null {
    const addon = loadJarvisMacosAddon();
    if (!addon?.getMouseLocation) return null;
    try {
      const loc = addon.getMouseLocation();
      if (
        loc == null ||
        !Number.isFinite(loc.x) ||
        !Number.isFinite(loc.y)
      ) {
        return null;
      }
      return {
        x: loc.x,
        y: loc.y,
        coordinateSpace:
          loc.coordinateSpace === "cocoa-global-bottom-left"
            ? "cocoa-global-bottom-left"
            : "cocoa-global-bottom-left",
      };
    } catch {
      return null;
    }
  }
}

export class UnavailableCursorReader implements CursorReader {
  readonly name = "unavailable-cursor";
  private readonly reason: string;

  constructor(reason = "Cursor unavailable") {
    this.reason = reason;
  }

  getCapability(): { status: EnvAvailability; reason?: string | null } {
    return { status: "UNAVAILABLE", reason: this.reason };
  }

  read(): null {
    return null;
  }
}
