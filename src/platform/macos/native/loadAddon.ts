/**
 * Shared loader for the optional compiled jarvis_macos.node addon.
 * Never shells out — require() of a .node file only.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../../");

export interface JarvisMacosNativeAddon {
  isNativeAvailable(): boolean;
  listRunningApplications(): Array<{
    name: string;
    bundleId: string | null;
    path: string | null;
    running: boolean;
  }>;
  getFrontmostApplication(): {
    name: string;
    bundleId: string | null;
    path: string | null;
    running: boolean;
  } | null;
  openApplication(
    bundleId: string | null,
    path: string | null,
  ): { ok: true } | { ok: false; code: string; message: string };
  terminateApplicationGracefully(
    bundleId: string | null,
    path: string | null,
  ): { ok: true } | { ok: false; code: string; message: string };
  isApplicationRunning(bundleId: string | null, path: string | null): boolean;
  getIdleTimeSeconds(): number;
  getDisplays(): Array<{
    id: string;
    width: number;
    height: number;
    scaleFactor?: number;
    isPrimary?: boolean;
    bounds?: { x: number; y: number; width: number; height: number };
  }>;
  getWindows(): Array<{
    id: string;
    title?: string | null;
    applicationName?: string | null;
    bundleId?: string | null;
    bounds?: { x: number; y: number; width: number; height: number };
    minimized?: boolean | null;
    visible?: boolean | null;
    active?: boolean | null;
  }>;
  getActiveWindow(): {
    id: string;
    title?: string | null;
    applicationName?: string | null;
    bundleId?: string | null;
    bounds?: { x: number; y: number; width: number; height: number };
    minimized?: boolean | null;
    visible?: boolean | null;
    active?: boolean | null;
  } | null;
  getSessionInfo(): { locked: boolean | null; userPresent: boolean | null };
  getMouseLocation(): {
    x: number;
    y: number;
    coordinateSpace: string;
  };
  getFocusedWindowInfo():
    | {
        ok: true;
        window: {
          title?: string | null;
          applicationName?: string | null;
          bundleId?: string | null;
          bounds?: { x: number; y: number; width: number; height: number } | null;
          role?: string | null;
        };
      }
    | {
        ok: false;
        code: string;
      };
  captureDisplay(displayId?: string | null): {
    format: "png";
    width: number;
    height: number;
    data: Uint8Array;
    displayId?: string | null;
  };
}

let cached: JarvisMacosNativeAddon | null | undefined;

export function getAddonCandidates(): string[] {
  return [
    path.join(ROOT, "build", "Release", "jarvis_macos.node"),
    path.join(ROOT, "build", "Debug", "jarvis_macos.node"),
    path.join(HERE, "addon", "build", "Release", "jarvis_macos.node"),
  ];
}

/**
 * Load compiled addon once. Returns null when missing / not darwin / load error.
 */
export function loadJarvisMacosAddon(): JarvisMacosNativeAddon | null {
  if (cached !== undefined) return cached;
  if (process.platform !== "darwin") {
    cached = null;
    return null;
  }
  for (const candidate of getAddonCandidates()) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const mod = require(candidate) as JarvisMacosNativeAddon;
      if (mod && typeof mod.isNativeAvailable === "function") {
        cached = mod;
        return cached;
      }
    } catch {
      // try next candidate
    }
  }
  cached = null;
  return null;
}

/** Test helper — clear memoized addon. */
export function resetAddonCache(): void {
  cached = undefined;
}
