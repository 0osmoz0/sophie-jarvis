import type {
  ScreenCaptureResult,
  ScreenCapabilityReport,
  ScreenInfo,
  ScreenResult,
  SessionInfo,
  WindowInfo,
} from "./types.js";

/**
 * ScreenBackend — observation only.
 * No executeScreenCommand / runShell / generic native command APIs.
 */
export interface ScreenBackend {
  readonly name: string;

  getCapabilityStatus(
    capability: "info" | "windows" | "activeWindow" | "session" | "capture",
  ): ScreenCapabilityReport;

  getScreens(): Promise<ScreenResult<{ screens: ScreenInfo[]; count: number }>>;

  getWindows(): Promise<ScreenResult<{ windows: WindowInfo[] }>>;

  getActiveWindow(): Promise<
    ScreenResult<{ window: WindowInfo | null; application: string | null }>
  >;

  getSessionInfo(): Promise<ScreenResult<SessionInfo>>;

  captureScreen(options?: {
    displayId?: string;
  }): Promise<ScreenResult<ScreenCaptureResult>>;
}
