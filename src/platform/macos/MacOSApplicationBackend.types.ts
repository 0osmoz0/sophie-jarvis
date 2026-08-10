/**
 * Types for the macOS application backend (Phase 5).
 */

export type MacOSNativeStatus =
  | "bridge_missing"
  | "bridge_loaded"
  | "not_darwin"
  | "permission_required"
  | "ok"
  | "error";

export interface MacOSDiscoveredApplication {
  name: string;
  bundleId: string | null;
  path: string | null;
  running: boolean | null;
}

/**
 * Optional N-API / native addon contract.
 * A future compiled bridge may implement NSWorkspace-based lifecycle.
 * Until present, MacOSApplicationBackend returns UNAVAILABLE — never shell.
 */
export interface MacOSNativeBridge {
  listRunningApplications(): Promise<MacOSDiscoveredApplication[]>;
  getFrontmostApplication(): Promise<MacOSDiscoveredApplication | null>;
  /**
   * Open by bundleId and/or .app path only.
   * Must NOT accept arbitrary commands.
   */
  openApplication(identity: {
    bundleId?: string;
    path?: string;
  }): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  /**
   * Graceful terminate only (equivalent to NSRunningApplication.terminate).
   * Must NOT force-quit / SIGKILL.
   */
  terminateApplicationGracefully(identity: {
    bundleId?: string;
    path?: string;
  }): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  isApplicationRunning(identity: {
    bundleId?: string;
    path?: string;
  }): Promise<boolean>;
}
