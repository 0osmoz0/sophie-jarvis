import { RiskLevel } from "../permissions/RiskLevel.js";
import { ApplicationRegistry } from "./ApplicationRegistry.js";
import { ApplicationResolver } from "./ApplicationResolver.js";
import { ApplicationPolicy } from "./ApplicationPolicy.js";
import { MemoryApplicationAuditLog } from "./ApplicationAuditLog.js";
import type {
  ApplicationAction,
  ApplicationAuditSink,
  ApplicationInfo,
  ApplicationResult,
  RegisteredApplication,
} from "./types.js";
import { APPLICATION_ERROR_CODES } from "./types.js";
import type { ApplicationBackend } from "../platform/ApplicationBackend.js";
import { MacOSApplicationBackend } from "../platform/macos/MacOSApplicationBackend.js";
import { MockApplicationBackend } from "../platform/MockApplicationBackend.js";

export interface ApplicationServiceOptions {
  registry?: ApplicationRegistry;
  resolver?: ApplicationResolver;
  policy?: ApplicationPolicy;
  audit?: ApplicationAuditSink;
  /** Platform backend — defaults to MacOSApplicationBackend on darwin. */
  backend?: ApplicationBackend;
}

function createDefaultBackend(): ApplicationBackend {
  return new MacOSApplicationBackend({ skipNativeLoad: false });
}

/**
 * ApplicationService — sole gateway for application lifecycle.
 *
 * Phase 5: delegates open/close/active/running to ApplicationBackend.
 * Policy + resolver remain mandatory before any backend mutation.
 */
export class ApplicationService {
  readonly registry: ApplicationRegistry;
  readonly resolver: ApplicationResolver;
  readonly policy: ApplicationPolicy;
  readonly audit: ApplicationAuditSink;
  readonly backend: ApplicationBackend;

  constructor(options: ApplicationServiceOptions = {}) {
    this.registry = options.registry ?? new ApplicationRegistry();
    this.resolver =
      options.resolver ?? new ApplicationResolver(this.registry);
    this.policy = options.policy ?? new ApplicationPolicy();
    this.audit = options.audit ?? new MemoryApplicationAuditLog();
    this.backend = options.backend ?? createDefaultBackend();
  }

  getBackendCapabilities() {
    return (
      [
        "listApplications",
        "getApplicationInfo",
        "isApplicationRunning",
        "getActiveApplication",
        "openApplication",
        "closeApplication",
      ] as const
    ).map((c) => this.backend.getCapabilityStatus(c));
  }

  async list(): Promise<ApplicationResult<{ applications: ApplicationInfo[] }>> {
    const policy = this.policy.evaluate("list");
    if (!policy.allowed) {
      return this.fail("list", policy.code ?? APPLICATION_ERROR_CODES.DENIED, policy.reason ?? "Denied", {
        risk: policy.riskLevel,
      });
    }

    // Phase 24 — prefer backend observation (NSWorkspace / mock catalog)
    // over registry-only iteration so Context sees real running apps.
    const cap = this.backend.getCapabilityStatus("listApplications");
    if (cap.status === "AVAILABLE") {
      const native = await this.backend.listApplications();
      if (native.success) {
        const byBundle = new Map(
          this.registry.list().map((r) => [r.bundleId ?? "", r] as const),
        );
        const apps = native.data.applications.map((a) => {
          const reg =
            (a.bundleId && byBundle.get(a.bundleId)) ||
            this.registry.list().find(
              (r) =>
                r.name.toLowerCase() === (a.name ?? "").toLowerCase(),
            );
          return {
            id: reg?.id ?? a.id ?? null,
            name: a.name,
            bundleId: a.bundleId ?? reg?.bundleId ?? null,
            path: a.path ?? reg?.path ?? null,
            running: a.running ?? true,
            active: a.active ?? null,
          };
        });
        this.record({
          action: "list",
          toolId: "application.list",
          application: null,
          bundleId: null,
          riskLevel: RiskLevel.LOW,
          confirmation: false,
          result: "success",
          capability: "listApplications",
        });
        return { success: true, data: { applications: apps } };
      }
    }

    const apps: ApplicationInfo[] = [];
    for (const reg of this.registry.list()) {
      const runningResult = await this.backend.isApplicationRunning({
        id: reg.id,
        name: reg.name,
        bundleId: reg.bundleId,
        path: reg.path,
      });
      const running = runningResult.success ? runningResult.data.running : null;
      apps.push(this.toInfo(reg, { running, active: null }));
    }

    this.record({
      action: "list",
      toolId: "application.list",
      application: null,
      bundleId: null,
      riskLevel: RiskLevel.LOW,
      confirmation: false,
      result: "success",
      capability: "listApplications",
    });

    return { success: true, data: { applications: apps } };
  }

  async info(args: {
    name?: string;
    bundleId?: string;
    path?: string;
    id?: string;
  }): Promise<ApplicationResult<ApplicationInfo>> {
    const resolved = this.resolver.fromArgs(args);
    if (!resolved.ok) {
      return this.fail("info", mapResolveCode(resolved.code), resolved.message, {
        application: typeof args.name === "string" ? args.name : null,
      });
    }

    const decision = this.policy.evaluate("info", resolved.app);
    if (!decision.allowed) {
      return this.fail("info", decision.code ?? APPLICATION_ERROR_CODES.APPLICATION_DENIED, decision.reason ?? "Denied", {
        application: resolved.app.name,
        bundleId: resolved.app.bundleId ?? null,
        risk: decision.riskLevel,
      });
    }

    const runningResult = await this.backend.isApplicationRunning(
      identityFrom(resolved.app),
    );
    const running = runningResult.success ? runningResult.data.running : null;

    const info = this.toInfo(resolved.app, { running, active: null });

    this.record({
      action: "info",
      toolId: "application.info",
      application: info.name,
      bundleId: info.bundleId ?? null,
      riskLevel: RiskLevel.LOW,
      confirmation: false,
      result: "success",
      capability: "getApplicationInfo",
    });

    return { success: true, data: info };
  }

  async active(): Promise<ApplicationResult<ApplicationInfo | null>> {
    const decision = this.policy.evaluate("active");
    if (!decision.allowed) {
      return this.fail("active", decision.code ?? APPLICATION_ERROR_CODES.DENIED, decision.reason ?? "Denied", {
        risk: decision.riskLevel,
      });
    }

    const result = await this.backend.getActiveApplication();
    if (!result.success) {
      return this.fail("active", result.error.code, result.error.message, {
        capability: "getActiveApplication",
      });
    }

    this.record({
      action: "active",
      toolId: "application.active",
      application: result.data?.name ?? null,
      bundleId: result.data?.bundleId ?? null,
      riskLevel: RiskLevel.LOW,
      confirmation: false,
      result: "success",
      capability: "getActiveApplication",
    });

    return result;
  }

  async open(
    args: {
      name?: string;
      bundleId?: string;
      path?: string;
      id?: string;
      taskId?: string | null;
      confirmed?: boolean;
    },
  ): Promise<ApplicationResult<ApplicationInfo>> {
    const resolved = this.resolver.fromArgs(args);
    if (!resolved.ok) {
      return this.fail("open", mapResolveCode(resolved.code), resolved.message, {
        application: typeof args.name === "string" ? args.name : null,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
        risk: RiskLevel.MEDIUM,
      });
    }

    const decision = this.policy.evaluate("open", resolved.app);
    if (!decision.allowed) {
      return this.fail(
        "open",
        decision.code ?? APPLICATION_ERROR_CODES.APPLICATION_DENIED,
        decision.reason ?? "Denied",
        {
          application: resolved.app.name,
          bundleId: resolved.app.bundleId ?? null,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
          risk: decision.riskLevel,
        },
      );
    }

    const result = await this.backend.openApplication(identityFrom(resolved.app));
    if (!result.success) {
      return this.fail("open", result.error.code, result.error.message, {
        application: resolved.app.name,
        bundleId: resolved.app.bundleId ?? null,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
        risk: RiskLevel.MEDIUM,
        capability: "openApplication",
      });
    }

    this.record({
      action: "open",
      toolId: "application.open",
      application: resolved.app.name,
      bundleId: resolved.app.bundleId ?? null,
      riskLevel: RiskLevel.MEDIUM,
      confirmation: !!args.confirmed,
      result: "success",
      taskId: args.taskId,
      capability: "openApplication",
    });

    return {
      success: true,
      data: {
        ...result.data,
        id: resolved.app.id,
        name: resolved.app.name,
        bundleId: resolved.app.bundleId ?? result.data.bundleId,
        path: resolved.app.path ?? result.data.path,
      },
    };
  }

  async close(
    args: {
      name?: string;
      bundleId?: string;
      path?: string;
      id?: string;
      taskId?: string | null;
      confirmed?: boolean;
    },
  ): Promise<ApplicationResult<ApplicationInfo>> {
    const resolved = this.resolver.fromArgs(args);
    if (!resolved.ok) {
      return this.fail("close", mapResolveCode(resolved.code), resolved.message, {
        application: typeof args.name === "string" ? args.name : null,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
        risk: RiskLevel.MEDIUM,
      });
    }

    const decision = this.policy.evaluate("close", resolved.app);
    if (!decision.allowed) {
      return this.fail(
        "close",
        decision.code ?? APPLICATION_ERROR_CODES.APPLICATION_DENIED,
        decision.reason ?? "Denied",
        {
          application: resolved.app.name,
          bundleId: resolved.app.bundleId ?? null,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
          risk: decision.riskLevel,
        },
      );
    }

    const result = await this.backend.closeApplication(identityFrom(resolved.app));
    if (!result.success) {
      return this.fail("close", result.error.code, result.error.message, {
        application: resolved.app.name,
        bundleId: resolved.app.bundleId ?? null,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
        risk: RiskLevel.MEDIUM,
        capability: "closeApplication",
      });
    }

    this.record({
      action: "close",
      toolId: "application.close",
      application: resolved.app.name,
      bundleId: resolved.app.bundleId ?? null,
      riskLevel: RiskLevel.MEDIUM,
      confirmation: !!args.confirmed,
      result: "success",
      taskId: args.taskId,
      capability: "closeApplication",
    });

    return {
      success: true,
      data: {
        ...result.data,
        id: resolved.app.id,
        name: resolved.app.name,
        bundleId: resolved.app.bundleId ?? result.data.bundleId,
        path: resolved.app.path ?? result.data.path,
      },
    };
  }

  protected toInfo(
    reg: RegisteredApplication,
    state: { running: boolean | null; active: boolean | null },
  ): ApplicationInfo {
    return {
      id: reg.id,
      name: reg.name,
      bundleId: reg.bundleId ?? null,
      path: reg.path ?? null,
      running: state.running,
      active: state.active,
    };
  }

  protected fail(
    action: ApplicationAction,
    code: string,
    message: string,
    meta: {
      application?: string | null;
      bundleId?: string | null;
      confirmation?: boolean;
      taskId?: string | null;
      risk?: RiskLevel;
      capability?: string | null;
    } = {},
  ): ApplicationResult<never> {
    const resultKind =
      code === APPLICATION_ERROR_CODES.UNAVAILABLE
        ? "unavailable"
        : code === APPLICATION_ERROR_CODES.PERMISSION_REQUIRED
          ? "permission_required"
          : code === APPLICATION_ERROR_CODES.DENIED ||
              code === APPLICATION_ERROR_CODES.APPLICATION_DENIED ||
              code === APPLICATION_ERROR_CODES.DENYLIST ||
              code === APPLICATION_ERROR_CODES.BLOCKED_PATH
            ? "denied"
            : "error";

    this.record({
      action,
      toolId: `application.${action}`,
      application: meta.application ?? null,
      bundleId: meta.bundleId ?? null,
      riskLevel: meta.risk ?? this.policy.riskFor(action),
      confirmation: meta.confirmation ?? false,
      result: resultKind,
      errorCode: code,
      taskId: meta.taskId,
      capability: meta.capability,
    });

    return { success: false, error: { code, message } };
  }

  protected record(partial: {
    action: ApplicationAction;
    toolId: string;
    application: string | null;
    bundleId: string | null;
    riskLevel: RiskLevel;
    confirmation: boolean;
    result: "success" | "denied" | "error" | "unavailable" | "permission_required";
    errorCode?: string;
    taskId?: string | null;
    capability?: string | null;
  }): void {
    const nativeStatus =
      this.backend instanceof MacOSApplicationBackend
        ? this.backend.getNativeStatus()
        : this.backend.name;

    this.audit.append({
      timestamp: new Date().toISOString(),
      taskId: partial.taskId ?? null,
      toolId: partial.toolId,
      action: partial.action,
      application: partial.application,
      bundleId: partial.bundleId,
      riskLevel: partial.riskLevel,
      confirmation: partial.confirmation,
      result: partial.result,
      errorCode: partial.errorCode,
      backend: this.backend.name,
      capability: partial.capability ?? null,
      nativeStatus,
    });
  }
}

function identityFrom(app: RegisteredApplication) {
  return {
    id: app.id,
    name: app.name,
    bundleId: app.bundleId ?? null,
    path: app.path ?? null,
  };
}

function mapResolveCode(code: string): string {
  if (code === APPLICATION_ERROR_CODES.NOT_FOUND) {
    return APPLICATION_ERROR_CODES.APPLICATION_NOT_FOUND;
  }
  if (code === APPLICATION_ERROR_CODES.INVALID_INPUT) {
    return APPLICATION_ERROR_CODES.INVALID_IDENTITY;
  }
  return code;
}

/**
 * MockApplicationService — ApplicationService + MockApplicationBackend.
 * Seeds mock catalog from registry for safe tests.
 */
export class MockApplicationService extends ApplicationService {
  private readonly mockBackend: MockApplicationBackend;

  constructor(options: Omit<ApplicationServiceOptions, "backend"> & {
    backend?: MockApplicationBackend;
  } = {}) {
    const mockBackend = options.backend ?? new MockApplicationBackend();
    const registry = options.registry ?? new ApplicationRegistry();
    super({
      ...options,
      registry,
      backend: mockBackend,
    });
    this.mockBackend = mockBackend;
    for (const app of registry.list()) {
      this.mockBackend.register({
        id: app.id,
        name: app.name,
        bundleId: app.bundleId ?? null,
        path: app.path ?? null,
        running: false,
        active: false,
      });
    }
  }

  mockSetRunning(id: string, running: boolean): void {
    this.mockBackend.setRunning(id, running);
  }
}
