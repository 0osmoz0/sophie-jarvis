import type { WindowInfo } from "../../screen/types.js";
import type { ScreenResult } from "../../screen/types.js";
import { SCREEN_ERROR_CODES } from "../../screen/types.js";
import type { MacOSScreenNativeBridge } from "./MacOSScreenBackend.types.js";

/**
 * Window metadata discovery via optional native bridge only.
 * No shell, no scripting, no CGEvent, no UI automation.
 */
export class MacOSWindowDiscovery {
  constructor(private readonly bridge: MacOSScreenNativeBridge | null) {}

  async listWindows(): Promise<ScreenResult<{ windows: WindowInfo[] }>> {
    if (!this.bridge) {
      return {
        success: false,
        error: {
          code: SCREEN_ERROR_CODES.UNAVAILABLE,
          message:
            "Native macOS capability unavailable (window metadata requires approved bridge).",
        },
      };
    }
    try {
      const windows = await this.bridge.getWindows();
      return { success: true, data: { windows } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/permission|screen.?record|accessibilit/i.test(message)) {
        return {
          success: false,
          error: {
            code: SCREEN_ERROR_CODES.PERMISSION_REQUIRED,
            message:
              "Window list requires macOS permission (Screen Recording / Accessibility). Not bypassed.",
          },
        };
      }
      return {
        success: false,
        error: {
          code: SCREEN_ERROR_CODES.NATIVE_ERROR,
          message,
        },
      };
    }
  }
}
