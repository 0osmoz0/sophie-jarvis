/**
 * Phase 13 — optional screen / window / capture bridge (CoreGraphics + ImageIO).
 */
import type { MacOSScreenNativeBridge } from "../MacOSScreenBackend.types.js";
import { loadJarvisMacosAddon } from "./loadAddon.js";

function createBridge(): MacOSScreenNativeBridge | undefined {
  const addon = loadJarvisMacosAddon();
  if (!addon) return undefined;
  return {
    async getDisplays() {
      return addon.getDisplays();
    },
    async getWindows() {
      return addon.getWindows();
    },
    async getActiveWindow() {
      return addon.getActiveWindow();
    },
    async getSessionInfo() {
      return addon.getSessionInfo();
    },
    async captureDisplay(displayId) {
      try {
        return addon.captureDisplay(displayId ?? null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/permission|screen recording/i.test(message)) {
          throw new Error(
            `PERMISSION_REQUIRED: ${message}`,
          );
        }
        throw err;
      }
    },
  };
}

export const bridge: MacOSScreenNativeBridge | undefined = createBridge();
export default bridge;
