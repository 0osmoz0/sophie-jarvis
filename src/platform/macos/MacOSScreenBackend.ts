import type { ScreenBackend } from "../../screen/ScreenBackend.js";
import type {
  ScreenCaptureResult,
  ScreenCapabilityReport,
  ScreenInfo,
  ScreenResult,
  SessionInfo,
  WindowInfo,
} from "../../screen/types.js";
import { SCREEN_ERROR_CODES } from "../../screen/types.js";
import { MacOSWindowDiscovery } from "./MacOSWindowDiscovery.js";
import type {
  MacOSScreenNativeBridge,
  MacOSScreenNativeStatus,
} from "./MacOSScreenBackend.types.js";

export interface MacOSScreenBackendOptions {
  bridge?: MacOSScreenNativeBridge | null;
  skipNativeLoad?: boolean;
}

export async function tryLoadMacOSScreenBridge(): Promise<MacOSScreenNativeBridge | null> {
  if (process.platform !== "darwin") return null;
  try {
    const mod = await import(
      /* webpackIgnore: true */ "./native/jarvis_macos_screen_bridge.js"
    );
    const bridge =
      (mod as { default?: MacOSScreenNativeBridge; bridge?: MacOSScreenNativeBridge })
        .default ?? (mod as { bridge?: MacOSScreenNativeBridge }).bridge;
    return bridge ?? null;
  } catch {
    return null;
  }
}

/**
 * MacOSScreenBackend — observation only.
 * Without approved N-API / ScreenCaptureKit bridge → UNAVAILABLE (honest).
 * Never uses shell screencapture, scripting, or UI automation.
 */
export class MacOSScreenBackend implements ScreenBackend {
  readonly name = "macos-screen";
  private bridge: MacOSScreenNativeBridge | null;
  private windows: MacOSWindowDiscovery;
  private loadAttempted = false;
  private nativeStatus: MacOSScreenNativeStatus;

  constructor(options: MacOSScreenBackendOptions = {}) {
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
    this.windows = new MacOSWindowDiscovery(this.bridge);
  }

  getNativeStatus(): MacOSScreenNativeStatus {
    return this.nativeStatus;
  }

  async ensureBridge(): Promise<MacOSScreenNativeBridge | null> {
    if (this.loadAttempted) return this.bridge;
    this.loadAttempted = true;
    if (process.platform !== "darwin") {
      this.nativeStatus = "not_darwin";
      this.bridge = null;
      this.windows = new MacOSWindowDiscovery(null);
      return null;
    }
    this.bridge = await tryLoadMacOSScreenBridge();
    this.nativeStatus = this.bridge ? "bridge_loaded" : "bridge_missing";
    this.windows = new MacOSWindowDiscovery(this.bridge);
    return this.bridge;
  }

  getCapabilityStatus(
    capability: "info" | "windows" | "activeWindow" | "session" | "capture",
  ): ScreenCapabilityReport {
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
          "Native screen bridge not loaded. CoreGraphics / ScreenCaptureKit require an approved addon (not shell).",
        permission:
          capability === "capture" || capability === "windows"
            ? "Screen Recording"
            : null,
      };
    }
    if (capability === "capture" || capability === "windows") {
      return {
        capability,
        status: "AVAILABLE",
        permission: "Screen Recording",
        reason: "Bridge loaded; Screen Recording may still be required at runtime.",
      };
    }
    return {
      capability,
      status: "AVAILABLE",
      reason: "Bridge loaded.",
    };
  }

  async getScreens(): Promise<
    ScreenResult<{ screens: ScreenInfo[]; count: number }>
  > {
    await this.ensureBridge();
    if (!this.bridge) return unavailable("getScreens");
    try {
      const screens = await this.bridge.getDisplays();
      return { success: true, data: { screens, count: screens.length } };
    } catch (err) {
      return nativeError(err);
    }
  }

  async getWindows(): Promise<ScreenResult<{ windows: WindowInfo[] }>> {
    await this.ensureBridge();
    return this.windows.listWindows();
  }

  async getActiveWindow(): Promise<
    ScreenResult<{ window: WindowInfo | null; application: string | null }>
  > {
    await this.ensureBridge();
    if (!this.bridge) return unavailable("getActiveWindow");
    try {
      const window = await this.bridge.getActiveWindow();
      return {
        success: true,
        data: {
          window,
          application: window?.applicationName ?? null,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/permission|accessibilit/i.test(message)) {
        this.nativeStatus = "permission_required";
        return {
          success: false,
          error: {
            code: SCREEN_ERROR_CODES.PERMISSION_REQUIRED,
            message: "Active window requires macOS permission (not bypassed).",
          },
        };
      }
      return nativeError(err);
    }
  }

  async getSessionInfo(): Promise<ScreenResult<SessionInfo>> {
    await this.ensureBridge();
    if (!this.bridge) {
      // Honest: do not invent locked/userPresent
      return {
        success: true,
        data: { locked: null, userPresent: null },
      };
    }
    try {
      const session = await this.bridge.getSessionInfo();
      return { success: true, data: session };
    } catch {
      return {
        success: true,
        data: { locked: null, userPresent: null },
      };
    }
  }

  async captureScreen(options?: {
    displayId?: string;
  }): Promise<ScreenResult<ScreenCaptureResult>> {
    await this.ensureBridge();
    if (!this.bridge) return unavailable("captureScreen");
    try {
      const captured = await this.bridge.captureDisplay(options?.displayId);
      return {
        success: true,
        data: {
          displayId: captured.displayId ?? options?.displayId ?? null,
          image: {
            format: "png",
            width: captured.width,
            height: captured.height,
            data: captured.data,
          },
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/permission|screen.?record/i.test(message)) {
        this.nativeStatus = "permission_required";
        return {
          success: false,
          error: {
            code: SCREEN_ERROR_CODES.PERMISSION_REQUIRED,
            message: "Screen Recording permission required (not bypassed).",
          },
        };
      }
      return nativeError(err);
    }
  }
}

function unavailable(capability: string): ScreenResult<never> {
  return {
    success: false,
    error: {
      code: SCREEN_ERROR_CODES.UNAVAILABLE,
      message: `Native macOS capability unavailable (${capability}). No shell/scripting fallback.`,
    },
  };
}

function nativeError(err: unknown): ScreenResult<never> {
  return {
    success: false,
    error: {
      code: SCREEN_ERROR_CODES.NATIVE_ERROR,
      message: err instanceof Error ? err.message : String(err),
    },
  };
}
