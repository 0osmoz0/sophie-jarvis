/**
 * Phase 13 — optional aggregate idle bridge (IOKit HIDIdleTime only).
 */
import type { MacOSUserActivityNativeBridge } from "../MacOSUserActivityBackend.types.js";
import { loadJarvisMacosAddon } from "./loadAddon.js";

function createBridge(): MacOSUserActivityNativeBridge | undefined {
  const addon = loadJarvisMacosAddon();
  if (!addon) return undefined;
  return {
    async getIdleTimeSeconds() {
      return addon.getIdleTimeSeconds();
    },
  };
}

export const bridge: MacOSUserActivityNativeBridge | undefined = createBridge();
export default bridge;
