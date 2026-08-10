import type {
  ApplicationBackend,
  BackendApplicationIdentity,
  BackendCapability,
  CapabilityReport,
} from "../ApplicationBackend.js";
import type { ApplicationInfo, ApplicationResult } from "../../applications/types.js";
import { APPLICATION_ERROR_CODES } from "../../applications/types.js";
import { MacOSApplicationDiscovery } from "./MacOSApplicationDiscovery.js";
import type { MacOSNativeBridge } from "./MacOSApplicationBackend.types.js";
import type { MacOSNativeStatus } from "./MacOSApplicationBackend.types.js";

export interface MacOSApplicationBackendOptions {
  /** Inject a bridge for tests; production tries optional native load. */
  bridge?: MacOSNativeBridge | null;
  /** Skip dynamic load (tests). */
  skipNativeLoad?: boolean;
}

/**
 * Attempt to load an optional native addon.
 * Never uses shell. Missing module → null (capabilities UNAVAILABLE).
 */
export async function tryLoadMacOSNativeBridge(): Promise<MacOSNativeBridge | null> {
  if (process.platform !== "darwin") return null;
  try {
    // Optional compiled N-API module — not shipped in Phase 5.
    // Path is fixed; absence is expected and safe.
    const mod = await import(
      /* webpackIgnore: true */ "./native/jarvis_macos_bridge.js"
    );
    const bridge = (mod as { default?: MacOSNativeBridge; bridge?: MacOSNativeBridge })
      .default ?? (mod as { bridge?: MacOSNativeBridge }).bridge;
    return bridge ?? null;
  } catch {
    return null;
  }
}

/**
 * MacOSApplicationBackend — typed application lifecycle only.
 *
 * Intended native APIs (when bridge present): NSWorkspace / AppKit equivalents.
 * Without bridge: honest UNAVAILABLE — no shell, no scripting, no force-kill.
 */
export class MacOSApplicationBackend implements ApplicationBackend {
  readonly name = "macos";
  private bridge: MacOSNativeBridge | null;
  private discovery: MacOSApplicationDiscovery;
  private loadAttempted = false;
  private nativeStatus: MacOSNativeStatus;

  constructor(options: MacOSApplicationBackendOptions = {}) {
    if (options.bridge !== undefined) {
      this.bridge = options.bridge;
      this.loadAttempted = true;
      this.nativeStatus = options.bridge ? "bridge_loaded" : "bridge_missing";
    } else if (options.skipNativeLoad || process.platform !== "darwin") {
      this.bridge = null;
      this.loadAttempted = true;
      this.nativeStatus =
        process.platform !== "darwin" ? "not_darwin" : "bridge_missing";
    } else {
      this.bridge = null;
      this.nativeStatus = "bridge_missing";
    }
    this.discovery = new MacOSApplicationDiscovery(this.bridge);
  }

  getNativeStatus(): MacOSNativeStatus {
    return this.nativeStatus;
  }

  /** Lazy-load optional native bridge once. */
  async ensureBridge(): Promise<MacOSNativeBridge | null> {
    if (this.loadAttempted) return this.bridge;
    this.loadAttempted = true;
    if (process.platform !== "darwin") {
      this.nativeStatus = "not_darwin";
      this.bridge = null;
      this.discovery = new MacOSApplicationDiscovery(null);
      return null;
    }
    this.bridge = await tryLoadMacOSNativeBridge();
    this.nativeStatus = this.bridge ? "bridge_loaded" : "bridge_missing";
    this.discovery = new MacOSApplicationDiscovery(this.bridge);
    return this.bridge;
  }

  getCapabilityStatus(capability: BackendCapability): CapabilityReport {
    if (process.platform !== "darwin") {
      return {
        capability,
        status: "UNAVAILABLE",
        reason: "Not running on macOS (darwin).",
      };
    }
    if (!this.bridge) {
      return {
        capability,
        status: "UNAVAILABLE",
        reason:
          "Native macOS bridge not loaded. NSWorkspace-based lifecycle requires an approved N-API addon (not shell).",
      };
    }
    if (capability === "getActiveApplication") {
      // Frontmost may need Accessibility depending on OS / sandboxing
      return {
        capability,
        status: "AVAILABLE",
        permission: null,
        reason: "Bridge loaded; Accessibility may still be required at runtime.",
      };
    }
    return {
      capability,
      status: "AVAILABLE",
      reason: "Native bridge loaded.",
    };
  }

  async listApplications(): Promise<
    ApplicationResult<{ applications: ApplicationInfo[] }>
  > {
    await this.ensureBridge();
    const native = await this.discovery.listFromNative();
    if (!native.success) return native;
    return {
      success: true,
      data: {
        applications: native.data.applications.map((a) => ({
          name: a.name,
          bundleId: a.bundleId,
          path: a.path,
          running: a.running,
          active: null,
        })),
      },
    };
  }

  async getApplicationInfo(
    identity: BackendApplicationIdentity,
  ): Promise<ApplicationResult<ApplicationInfo>> {
    await this.ensureBridge();
    const runningResult = await this.isApplicationRunning(identity);
    const running = runningResult.success ? runningResult.data.running : null;
    const name = identity.name ?? identity.bundleId ?? identity.path;
    if (!name) {
      return {
        success: false,
        error: {
          code: APPLICATION_ERROR_CODES.INVALID_IDENTITY,
          message: "Application identity incomplete",
        },
      };
    }
    let path = identity.path ?? null;
    if (path) {
      const verified = await this.discovery.verifyConfiguredPath(path);
      path = verified.path;
    }
    return {
      success: true,
      data: {
        id: identity.id ?? null,
        name: identity.name ?? String(name),
        bundleId: identity.bundleId ?? null,
        path,
        running,
        active: null,
      },
    };
  }

  async isApplicationRunning(
    identity: BackendApplicationIdentity,
  ): Promise<ApplicationResult<{ running: boolean }>> {
    await this.ensureBridge();
    if (!this.bridge) {
      return unavailable("isApplicationRunning");
    }
    if (!identity.bundleId && !identity.path) {
      return {
        success: false,
        error: {
          code: APPLICATION_ERROR_CODES.INVALID_IDENTITY,
          message: "bundleId or path required for running check",
        },
      };
    }
    try {
      const running = await this.bridge.isApplicationRunning({
        bundleId: identity.bundleId ?? undefined,
        path: identity.path ?? undefined,
      });
      return { success: true, data: { running } };
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

  async getActiveApplication(): Promise<ApplicationResult<ApplicationInfo | null>> {
    await this.ensureBridge();
    if (!this.bridge) {
      return unavailable("getActiveApplication");
    }
    try {
      const front = await this.bridge.getFrontmostApplication();
      if (!front) return { success: true, data: null };
      return {
        success: true,
        data: {
          name: front.name,
          bundleId: front.bundleId,
          path: front.path,
          running: true,
          active: true,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/permission|accessibilit/i.test(message)) {
        this.nativeStatus = "permission_required";
        return {
          success: false,
          error: {
            code: APPLICATION_ERROR_CODES.PERMISSION_REQUIRED,
            message:
              "Frontmost application requires macOS Accessibility permission (not bypassed).",
          },
        };
      }
      return {
        success: false,
        error: {
          code: APPLICATION_ERROR_CODES.NATIVE_ERROR,
          message,
        },
      };
    }
  }

  async openApplication(
    identity: BackendApplicationIdentity,
  ): Promise<ApplicationResult<ApplicationInfo>> {
    await this.ensureBridge();
    if (!this.bridge) {
      return unavailable("openApplication");
    }
    if (!identity.bundleId && !identity.path) {
      return {
        success: false,
        error: {
          code: APPLICATION_ERROR_CODES.INVALID_IDENTITY,
          message: "openApplication requires bundleId or path",
        },
      };
    }
    try {
      const result = await this.bridge.openApplication({
        bundleId: identity.bundleId ?? undefined,
        path: identity.path ?? undefined,
      });
      if (!result.ok) {
        return {
          success: false,
          error: {
            code: result.code || APPLICATION_ERROR_CODES.NATIVE_ERROR,
            message: result.message,
          },
        };
      }
      return {
        success: true,
        data: {
          id: identity.id ?? null,
          name: identity.name ?? identity.bundleId ?? identity.path ?? "application",
          bundleId: identity.bundleId ?? null,
          path: identity.path ?? null,
          running: true,
          active: null,
        },
      };
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

  async closeApplication(
    identity: BackendApplicationIdentity,
  ): Promise<ApplicationResult<ApplicationInfo>> {
    await this.ensureBridge();
    if (!this.bridge) {
      return unavailable("closeApplication");
    }
    if (!identity.bundleId && !identity.path) {
      return {
        success: false,
        error: {
          code: APPLICATION_ERROR_CODES.INVALID_IDENTITY,
          message: "closeApplication requires bundleId or path",
        },
      };
    }
    try {
      const result = await this.bridge.terminateApplicationGracefully({
        bundleId: identity.bundleId ?? undefined,
        path: identity.path ?? undefined,
      });
      if (!result.ok) {
        return {
          success: false,
          error: {
            code: result.code || APPLICATION_ERROR_CODES.NATIVE_ERROR,
            message: result.message,
          },
        };
      }
      return {
        success: true,
        data: {
          id: identity.id ?? null,
          name: identity.name ?? identity.bundleId ?? identity.path ?? "application",
          bundleId: identity.bundleId ?? null,
          path: identity.path ?? null,
          running: false,
          active: false,
        },
      };
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
}

function unavailable(capability: string): ApplicationResult<never> {
  return {
    success: false,
    error: {
      code: APPLICATION_ERROR_CODES.UNAVAILABLE,
      message: `Native macOS capability unavailable (${capability}). No shell/scripting fallback.`,
    },
  };
}
