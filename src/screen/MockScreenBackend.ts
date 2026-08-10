import type { ScreenBackend } from "./ScreenBackend.js";
import type {
  ScreenCaptureResult,
  ScreenCapabilityReport,
  ScreenInfo,
  ScreenResult,
  SessionInfo,
  WindowInfo,
} from "./types.js";
import { SCREEN_ERROR_CODES } from "./types.js";

/**
 * In-memory screen backend for tests — no real screen access.
 */
export class MockScreenBackend implements ScreenBackend {
  readonly name = "mock";

  private screens: ScreenInfo[] = [
    {
      id: "display-0",
      width: 1920,
      height: 1080,
      scaleFactor: 2,
      isPrimary: true,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    },
  ];

  private windows: WindowInfo[] = [];
  private activeWindowId: string | null = null;
  private session: SessionInfo = { locked: false, userPresent: true };
  private captureEnabled = true;

  getCapabilityStatus(
    capability: "info" | "windows" | "activeWindow" | "session" | "capture",
  ): ScreenCapabilityReport {
    if (capability === "capture" && !this.captureEnabled) {
      return {
        capability,
        status: "PERMISSION_REQUIRED",
        permission: "Screen Recording",
        reason: "Mock capture disabled for permission tests.",
      };
    }
    return {
      capability,
      status: "AVAILABLE",
      reason: "Mock backend — in-memory only.",
    };
  }

  setScreens(screens: ScreenInfo[]): void {
    this.screens = screens.map((s) => ({ ...s }));
  }

  setWindows(windows: WindowInfo[]): void {
    this.windows = windows.map((w) => ({ ...w }));
  }

  setActiveWindowId(id: string | null): void {
    this.activeWindowId = id;
  }

  setSession(session: SessionInfo): void {
    this.session = { ...session };
  }

  setCaptureEnabled(enabled: boolean): void {
    this.captureEnabled = enabled;
  }

  async getScreens(): Promise<
    ScreenResult<{ screens: ScreenInfo[]; count: number }>
  > {
    return {
      success: true,
      data: {
        screens: this.screens.map((s) => ({ ...s })),
        count: this.screens.length,
      },
    };
  }

  async getWindows(): Promise<ScreenResult<{ windows: WindowInfo[] }>> {
    return {
      success: true,
      data: { windows: this.windows.map((w) => ({ ...w })) },
    };
  }

  async getActiveWindow(): Promise<
    ScreenResult<{ window: WindowInfo | null; application: string | null }>
  > {
    const window =
      this.windows.find((w) => w.id === this.activeWindowId) ?? null;
    return {
      success: true,
      data: {
        window: window ? { ...window, active: true } : null,
        application: window?.applicationName ?? null,
      },
    };
  }

  async getSessionInfo(): Promise<ScreenResult<SessionInfo>> {
    return { success: true, data: { ...this.session } };
  }

  async captureScreen(options?: {
    displayId?: string;
  }): Promise<ScreenResult<ScreenCaptureResult>> {
    if (!this.captureEnabled) {
      return {
        success: false,
        error: {
          code: SCREEN_ERROR_CODES.PERMISSION_REQUIRED,
          message: "Screen Recording permission required (mock).",
        },
      };
    }
    const display =
      this.screens.find((s) => s.id === options?.displayId) ??
      this.screens.find((s) => s.isPrimary) ??
      this.screens[0];
    if (!display) {
      return {
        success: false,
        error: {
          code: SCREEN_ERROR_CODES.NOT_FOUND,
          message: "No display available",
        },
      };
    }
    // Tiny fake PNG-like buffer (not a real image decoder target)
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return {
      success: true,
      data: {
        displayId: display.id,
        image: {
          format: "png",
          width: display.width,
          height: display.height,
          data,
        },
      },
    };
  }
}
