import type {
  ApplicationBackend,
  BackendApplicationIdentity,
  BackendCapability,
  CapabilityReport,
} from "./ApplicationBackend.js";
import type { ApplicationInfo, ApplicationResult } from "../applications/types.js";
import { APPLICATION_ERROR_CODES } from "../applications/types.js";

/**
 * In-memory ApplicationBackend for unit/smoke tests.
 * Never touches real macOS apps. Never uses shell.
 */
export class MockApplicationBackend implements ApplicationBackend {
  readonly name = "mock";
  private readonly running = new Set<string>();
  private activeKey: string | null = null;
  private readonly catalog = new Map<string, ApplicationInfo>();

  getCapabilityStatus(capability: BackendCapability): CapabilityReport {
    return {
      capability,
      status: "AVAILABLE",
      reason: "Mock backend — in-memory only.",
    };
  }

  /** Register an app identity for mock open/close/info. */
  register(app: ApplicationInfo & { id: string }): void {
    this.catalog.set(app.id, { ...app });
    if (app.bundleId) this.catalog.set(`bundle:${app.bundleId}`, { ...app });
    if (app.name) this.catalog.set(`name:${app.name.toLowerCase()}`, { ...app });
  }

  setRunning(id: string, running: boolean): void {
    if (running) this.running.add(id);
    else {
      this.running.delete(id);
      if (this.activeKey === id) this.activeKey = null;
    }
  }

  /** Test helper — set frontmost without opening. */
  setActive(id: string | null): void {
    this.activeKey = id;
    if (id) this.running.add(id);
  }

  private keyOf(identity: BackendApplicationIdentity): string | null {
    if (identity.id) return identity.id;
    if (identity.bundleId) {
      const hit = this.catalog.get(`bundle:${identity.bundleId}`);
      return hit?.id ?? identity.bundleId;
    }
    if (identity.name) {
      const hit = this.catalog.get(`name:${identity.name.toLowerCase()}`);
      return hit?.id ?? identity.name;
    }
    if (identity.path) return identity.path;
    return null;
  }

  private resolveInfo(identity: BackendApplicationIdentity): ApplicationInfo | null {
    if (identity.id && this.catalog.has(identity.id)) {
      return { ...this.catalog.get(identity.id)! };
    }
    if (identity.bundleId && this.catalog.has(`bundle:${identity.bundleId}`)) {
      return { ...this.catalog.get(`bundle:${identity.bundleId}`)! };
    }
    if (identity.name && this.catalog.has(`name:${identity.name.toLowerCase()}`)) {
      return { ...this.catalog.get(`name:${identity.name.toLowerCase()}`)! };
    }
    if (identity.name || identity.bundleId || identity.path) {
      return {
        id: identity.id ?? null,
        name: identity.name ?? identity.bundleId ?? identity.path ?? "unknown",
        bundleId: identity.bundleId ?? null,
        path: identity.path ?? null,
        running: false,
        active: false,
      };
    }
    return null;
  }

  async listApplications(): Promise<
    ApplicationResult<{ applications: ApplicationInfo[] }>
  > {
    const seen = new Set<string>();
    const applications: ApplicationInfo[] = [];
    for (const [key, app] of this.catalog) {
      if (key.startsWith("bundle:") || key.startsWith("name:")) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      applications.push({
        ...app,
        running: this.running.has(app.id ?? key),
      });
    }
    return { success: true, data: { applications } };
  }

  async getApplicationInfo(
    identity: BackendApplicationIdentity,
  ): Promise<ApplicationResult<ApplicationInfo>> {
    const info = this.resolveInfo(identity);
    if (!info) {
      return {
        success: false,
        error: {
          code: APPLICATION_ERROR_CODES.APPLICATION_NOT_FOUND,
          message: "Application not found in mock catalog",
        },
      };
    }
    const key = this.keyOf(identity) ?? info.id ?? info.name;
    return {
      success: true,
      data: {
        ...info,
        running: this.running.has(key),
        active: this.activeKey === key,
      },
    };
  }

  async isApplicationRunning(
    identity: BackendApplicationIdentity,
  ): Promise<ApplicationResult<{ running: boolean }>> {
    const key = this.keyOf(identity);
    if (!key) {
      return {
        success: false,
        error: {
          code: APPLICATION_ERROR_CODES.INVALID_IDENTITY,
          message: "Invalid identity",
        },
      };
    }
    return { success: true, data: { running: this.running.has(key) } };
  }

  async getActiveApplication(): Promise<ApplicationResult<ApplicationInfo | null>> {
    if (!this.activeKey) return { success: true, data: null };
    const info = this.catalog.get(this.activeKey);
    if (!info) return { success: true, data: null };
    return {
      success: true,
      data: { ...info, running: true, active: true },
    };
  }

  async openApplication(
    identity: BackendApplicationIdentity,
  ): Promise<ApplicationResult<ApplicationInfo>> {
    const info = this.resolveInfo(identity);
    if (!info) {
      return {
        success: false,
        error: {
          code: APPLICATION_ERROR_CODES.APPLICATION_NOT_FOUND,
          message: "Application not found",
        },
      };
    }
    const key = info.id ?? this.keyOf(identity)!;
    this.running.add(key);
    this.activeKey = key;
    return {
      success: true,
      data: { ...info, id: key, running: true, active: true },
    };
  }

  async closeApplication(
    identity: BackendApplicationIdentity,
  ): Promise<ApplicationResult<ApplicationInfo>> {
    const info = this.resolveInfo(identity);
    if (!info) {
      return {
        success: false,
        error: {
          code: APPLICATION_ERROR_CODES.APPLICATION_NOT_FOUND,
          message: "Application not found",
        },
      };
    }
    const key = info.id ?? this.keyOf(identity)!;
    if (!this.running.has(key)) {
      return {
        success: false,
        error: {
          code: APPLICATION_ERROR_CODES.APPLICATION_NOT_RUNNING,
          message: `Application "${info.name}" is not running`,
        },
      };
    }
    this.running.delete(key);
    if (this.activeKey === key) this.activeKey = null;
    return {
      success: true,
      data: { ...info, id: key, running: false, active: false },
    };
  }
}
