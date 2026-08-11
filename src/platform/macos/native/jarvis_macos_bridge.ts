/**
 * Phase 13 — optional NSWorkspace application bridge.
 * Loads compiled jarvis_macos.node when present; otherwise exports no bridge.
 */
import type { MacOSNativeBridge } from "../MacOSApplicationBackend.types.js";
import { loadJarvisMacosAddon } from "./loadAddon.js";

function createBridge(): MacOSNativeBridge | undefined {
  const addon = loadJarvisMacosAddon();
  if (!addon) return undefined;
  return {
    async listRunningApplications() {
      return addon.listRunningApplications();
    },
    async getFrontmostApplication() {
      return addon.getFrontmostApplication();
    },
    async openApplication(identity) {
      return addon.openApplication(
        identity.bundleId ?? null,
        identity.path ?? null,
      );
    },
    async terminateApplicationGracefully(identity) {
      return addon.terminateApplicationGracefully(
        identity.bundleId ?? null,
        identity.path ?? null,
      );
    },
    async isApplicationRunning(identity) {
      return addon.isApplicationRunning(
        identity.bundleId ?? null,
        identity.path ?? null,
      );
    },
  };
}

export const bridge: MacOSNativeBridge | undefined = createBridge();
export default bridge;
