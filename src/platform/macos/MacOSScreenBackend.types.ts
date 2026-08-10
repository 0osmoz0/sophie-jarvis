/**
 * Types for optional macOS screen native bridge (Phase 6).
 */
import type { ScreenInfo, SessionInfo, WindowInfo } from "../../screen/types.js";

export interface MacOSScreenNativeBridge {
  getDisplays(): Promise<ScreenInfo[]>;
  getWindows(): Promise<WindowInfo[]>;
  getActiveWindow(): Promise<WindowInfo | null>;
  getSessionInfo(): Promise<SessionInfo>;
  /**
   * Capture via ScreenCaptureKit / approved API only.
   * Must NOT invoke shell screencapture.
   */
  captureDisplay(displayId?: string): Promise<{
    format: "png";
    width: number;
    height: number;
    data: Uint8Array;
    displayId?: string | null;
  }>;
}

export type MacOSScreenNativeStatus =
  | "bridge_missing"
  | "bridge_loaded"
  | "not_darwin"
  | "permission_required"
  | "ok"
  | "error";
