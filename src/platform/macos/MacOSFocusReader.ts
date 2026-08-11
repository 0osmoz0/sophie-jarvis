/**
 * Phase 25 — macOS AX focused window reader.
 */
import { loadJarvisMacosAddon } from "./native/loadAddon.js";
import type {
  FocusReader,
  FocusWindowReadResult,
} from "../../context/EnvironmentObservation.js";
import type { EnvAvailability } from "../../context/EnvironmentContext.js";

export class MacOSFocusReader implements FocusReader {
  readonly name = "macos-ax-focus";

  getCapability(): { status: EnvAvailability; reason?: string | null } {
    const addon = loadJarvisMacosAddon();
    if (!addon || typeof addon.getFocusedWindowInfo !== "function") {
      return {
        status: "UNAVAILABLE",
        reason: "Native addon missing getFocusedWindowInfo",
      };
    }
    return {
      status: "AVAILABLE",
      reason: "Accessibility may be required at runtime",
    };
  }

  read(): FocusWindowReadResult | null {
    const addon = loadJarvisMacosAddon();
    if (!addon?.getFocusedWindowInfo) return null;
    try {
      const res = addon.getFocusedWindowInfo();
      if (!res?.ok || !res.window) return null;
      const w = res.window;
      return {
        id: null,
        title: w.title ?? null,
        applicationName: w.applicationName ?? null,
        bundleId: w.bundleId ?? null,
        bounds: w.bounds ?? null,
      };
    } catch {
      return null;
    }
  }

  readWithStatus(): {
    status: EnvAvailability;
    window: FocusWindowReadResult | null;
    reason?: string | null;
  } {
    const addon = loadJarvisMacosAddon();
    if (!addon?.getFocusedWindowInfo) {
      return {
        status: "UNAVAILABLE",
        window: null,
        reason: "Native bridge missing",
      };
    }
    try {
      const res = addon.getFocusedWindowInfo();
      if (!res) {
        return { status: "UNKNOWN", window: null, reason: "No response" };
      }
      if (!res.ok) {
        const code = res.code ?? "UNAVAILABLE";
        const status: EnvAvailability =
          code === "PERMISSION_REQUIRED"
            ? "PERMISSION_REQUIRED"
            : code === "UNAVAILABLE"
              ? "UNAVAILABLE"
              : "UNKNOWN";
        return { status, window: null, reason: code };
      }
      const w = res.window;
      if (!w) {
        return { status: "UNKNOWN", window: null, reason: "Empty window" };
      }
      return {
        status: "AVAILABLE",
        window: {
          id: null,
          title: w.title ?? null,
          applicationName: w.applicationName ?? null,
          bundleId: w.bundleId ?? null,
          bounds: w.bounds ?? null,
        },
      };
    } catch (err) {
      return {
        status: "UNKNOWN",
        window: null,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export class UnavailableFocusReader implements FocusReader {
  readonly name = "unavailable-focus";

  getCapability(): { status: EnvAvailability; reason?: string | null } {
    return { status: "UNAVAILABLE", reason: "Focus reader unavailable" };
  }

  read(): null {
    return null;
  }
}
