import fs from "node:fs/promises";
import type { MacOSDiscoveredApplication } from "./MacOSApplicationBackend.types.js";
import type { MacOSNativeBridge } from "./MacOSApplicationBackend.types.js";
import type { ApplicationResult } from "../../applications/types.js";
import { APPLICATION_ERROR_CODES } from "../../applications/types.js";

/**
 * MacOSApplicationDiscovery — resolve / enrich application metadata.
 *
 * Does NOT scan the whole disk.
 * Does NOT use find / ls / mdfind via shell.
 * Optional native LaunchServices/NSWorkspace data only if a bridge is loaded.
 * Otherwise: path existence checks for explicitly provided .app paths (read-only).
 */
export class MacOSApplicationDiscovery {
  constructor(private readonly bridge: MacOSNativeBridge | null = null) {}

  async pathExists(appPath: string): Promise<boolean> {
    if (!appPath.endsWith(".app")) return false;
    try {
      await fs.access(appPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * System-wide discovery — only when native bridge provides it.
   */
  async listFromNative(): Promise<
    ApplicationResult<{ applications: MacOSDiscoveredApplication[] }>
  > {
    if (!this.bridge) {
      return {
        success: false,
        error: {
          code: APPLICATION_ERROR_CODES.UNAVAILABLE,
          message:
            "Native macOS capability unavailable (no NSWorkspace/LaunchServices bridge loaded).",
        },
      };
    }
    try {
      const applications = await this.bridge.listRunningApplications();
      return { success: true, data: { applications } };
    } catch (err) {
      return {
        success: false,
        error: {
          code: APPLICATION_ERROR_CODES.NATIVE_ERROR,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  async enrichPath(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    const exists = await this.pathExists(path);
    return exists ? path : path; // keep configured path; existence is separate
  }

  async verifyConfiguredPath(
    path: string | null | undefined,
  ): Promise<{ path: string | null; exists: boolean | null }> {
    if (!path) return { path: null, exists: null };
    return { path, exists: await this.pathExists(path) };
  }
}
