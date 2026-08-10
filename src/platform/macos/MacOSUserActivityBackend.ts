import type { UserActivityBackend } from "../../presence/UserActivityBackend.js";
import type {
  UserActivityCapabilityReport,
  UserActivityResult,
  UserActivitySnapshot,
} from "../../presence/types.js";
import { USER_ACTIVITY_ERROR_CODES } from "../../presence/types.js";
import type {
  MacOSUserActivityNativeBridge,
  MacOSUserActivityNativeStatus,
} from "./MacOSUserActivityBackend.types.js";

export interface MacOSUserActivityBackendOptions {
  bridge?: MacOSUserActivityNativeBridge | null;
  skipNativeLoad?: boolean;
}

export async function tryLoadMacOSUserActivityBridge(): Promise<MacOSUserActivityNativeBridge | null> {
  if (process.platform !== "darwin") return null;
  try {
    const mod = await import(
      /* webpackIgnore: true */ "./native/jarvis_macos_user_activity_bridge.js"
    );
    const bridge =
      (mod as {
        default?: MacOSUserActivityNativeBridge;
        bridge?: MacOSUserActivityNativeBridge;
      }).default ?? (mod as { bridge?: MacOSUserActivityNativeBridge }).bridge;
    return bridge ?? null;
  } catch {
    return null;
  }
}

/**
 * MacOSUserActivityBackend — aggregate idle duration only.
 *
 * When a native bridge is present it must expose only system idle seconds
 * (HID idle aggregate). It must never install event taps, key loggers,
 * or mouse trackers.
 *
 * Without bridge: UNAVAILABLE (honest). No shell fallback.
 */
export class MacOSUserActivityBackend implements UserActivityBackend {
  readonly name = "macos-user-activity";
  private bridge: MacOSUserActivityNativeBridge | null;
  private loadAttempted = false;
  private nativeStatus: MacOSUserActivityNativeStatus;

  constructor(options: MacOSUserActivityBackendOptions = {}) {
    if (options.bridge !== undefined) {
      this.bridge = options.bridge;
      this.loadAttempted = true;
      this.nativeStatus = options.bridge ? "bridge_loaded" : "bridge_missing";
    } else if (options.skipNativeLoad || process.platform !== "darwin") {
      this.bridge = null;
      this.loadAttempted = true;
      this.nativeStatus =
        process.platform !== "darwin" ? "not_darwin" : "bridge_missing";
    } else {
      this.bridge = null;
      this.nativeStatus = "bridge_missing";
    }
  }

  getNativeStatus(): MacOSUserActivityNativeStatus {
    return this.nativeStatus;
  }

  async ensureBridge(): Promise<MacOSUserActivityNativeBridge | null> {
    if (this.loadAttempted) return this.bridge;
    this.loadAttempted = true;
    if (process.platform !== "darwin") {
      this.nativeStatus = "not_darwin";
      this.bridge = null;
      return null;
    }
    this.bridge = await tryLoadMacOSUserActivityBridge();
    this.nativeStatus = this.bridge ? "bridge_loaded" : "bridge_missing";
    return this.bridge;
  }

  getCapabilityStatus(
    capability: "getActivitySnapshot" | "getIdleDuration",
  ): UserActivityCapabilityReport {
    if (process.platform !== "darwin") {
      return {
        capability,
        status: "UNAVAILABLE",
        reason: "Not running on macOS (darwin).",
      };
    }
    if (!this.bridge) {
      return {
        capability,
        status: "UNAVAILABLE",
        reason:
          "Native user-activity bridge not loaded. Aggregate idle requires an approved addon (not event taps / shell).",
      };
    }
    return {
      capability,
      status: "AVAILABLE",
      reason: "Native bridge loaded (aggregate idle only).",
    };
  }

  async getIdleDuration(): Promise<
    UserActivityResult<{ idleSeconds: number | null }>
  > {
    await this.ensureBridge();
    if (!this.bridge) {
      return {
        success: false,
        error: {
          code: USER_ACTIVITY_ERROR_CODES.UNAVAILABLE,
          message:
            "Native macOS capability unavailable (aggregate idle). No input interception fallback.",
        },
      };
    }
    try {
      const idleSeconds = await this.bridge.getIdleTimeSeconds();
      if (!Number.isFinite(idleSeconds) || idleSeconds < 0) {
        return { success: true, data: { idleSeconds: null } };
      }
      return { success: true, data: { idleSeconds } };
    } catch (err) {
      return {
        success: false,
        error: {
          code: USER_ACTIVITY_ERROR_CODES.NATIVE_ERROR,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  async getActivitySnapshot(): Promise<UserActivityResult<UserActivitySnapshot>> {
    const idle = await this.getIdleDuration();
    if (!idle.success) {
      return {
        success: false,
        error: idle.error,
      };
    }
    const now = Date.now();
    const idleSeconds = idle.data.idleSeconds;
    return {
      success: true,
      data: {
        status: "UNKNOWN",
        idleSeconds,
        lastActivityAt:
          idleSeconds === null ? null : now - idleSeconds * 1000,
        observedAt: now,
        source: idleSeconds === null ? "unavailable" : "native",
      },
    };
  }
}
