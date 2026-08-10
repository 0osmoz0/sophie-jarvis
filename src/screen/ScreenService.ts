import { RiskLevel } from "../permissions/RiskLevel.js";
import type { ScreenBackend } from "./ScreenBackend.js";
import { ScreenPolicy } from "./ScreenPolicy.js";
import { MemoryScreenAuditLog } from "./ScreenAuditLog.js";
import type {
  ScreenAction,
  ScreenAuditSink,
  ScreenCaptureResult,
  ScreenCapabilityStatus,
  ScreenInfo,
  ScreenResult,
  SessionInfo,
  WindowInfo,
} from "./types.js";
import { SCREEN_ERROR_CODES } from "./types.js";
import { MacOSScreenBackend } from "../platform/macos/MacOSScreenBackend.js";

export interface ScreenServiceOptions {
  backend?: ScreenBackend;
  policy?: ScreenPolicy;
  audit?: ScreenAuditSink;
}

/**
 * ScreenService — observation gateway.
 * Capture results are ephemeral: caller owns the buffer; service does not retain it.
 */
export class ScreenService {
  readonly backend: ScreenBackend;
  readonly policy: ScreenPolicy;
  readonly audit: ScreenAuditSink;

  /** Last capture held only until explicitly released (retention default = 0). */
  private lastCapture: ScreenCaptureResult | null = null;

  constructor(options: ScreenServiceOptions = {}) {
    this.backend = options.backend ?? new MacOSScreenBackend();
    this.policy = options.policy ?? new ScreenPolicy();
    this.audit = options.audit ?? new MemoryScreenAuditLog();
  }

  getCapabilities() {
    return (
      ["info", "windows", "activeWindow", "session", "capture"] as const
    ).map((c) => this.backend.getCapabilityStatus(c));
  }

  async info(): Promise<
    ScreenResult<{ screens: ScreenInfo[]; count: number }>
  > {
    const decision = this.policy.evaluate("info");
    if (!decision.allowed) {
      return this.fail("info", SCREEN_ERROR_CODES.DENIED, decision.reason ?? "Denied");
    }
    const result = await this.backend.getScreens();
    this.recordFromResult("info", "screen.info", result, null, decision.riskLevel);
    return result;
  }

  async windows(): Promise<ScreenResult<{ windows: WindowInfo[] }>> {
    const decision = this.policy.evaluate("windows");
    if (!decision.allowed) {
      return this.fail("windows", SCREEN_ERROR_CODES.DENIED, decision.reason ?? "Denied");
    }
    const cap = this.backend.getCapabilityStatus("windows");
    if (cap.status === "PERMISSION_REQUIRED") {
      return this.fail(
        "windows",
        SCREEN_ERROR_CODES.PERMISSION_REQUIRED,
        cap.reason ?? "Window list requires macOS permission",
        { permissionState: cap.status },
      );
    }
    if (cap.status === "UNAVAILABLE") {
      return this.fail(
        "windows",
        SCREEN_ERROR_CODES.UNAVAILABLE,
        cap.reason ?? "Window list unavailable",
        { permissionState: cap.status },
      );
    }
    const result = await this.backend.getWindows();
    this.recordFromResult("windows", "screen.windows", result, null, decision.riskLevel, cap.status);
    return result;
  }

  async activeWindow(): Promise<
    ScreenResult<{ window: WindowInfo | null; application: string | null }>
  > {
    const decision = this.policy.evaluate("activeWindow");
    if (!decision.allowed) {
      return this.fail("activeWindow", SCREEN_ERROR_CODES.DENIED, decision.reason ?? "Denied");
    }
    const cap = this.backend.getCapabilityStatus("activeWindow");
    if (cap.status === "PERMISSION_REQUIRED") {
      return this.fail(
        "activeWindow",
        SCREEN_ERROR_CODES.PERMISSION_REQUIRED,
        cap.reason ?? "Active window requires permission",
        { permissionState: cap.status },
      );
    }
    if (cap.status === "UNAVAILABLE") {
      return this.fail(
        "activeWindow",
        SCREEN_ERROR_CODES.UNAVAILABLE,
        cap.reason ?? "Active window unavailable",
        { permissionState: cap.status },
      );
    }
    const result = await this.backend.getActiveWindow();
    const targetId =
      result.success && result.data.window ? result.data.window.id : null;
    this.recordFromResult(
      "activeWindow",
      "screen.activeWindow",
      result,
      targetId,
      decision.riskLevel,
      cap.status,
    );
    return result;
  }

  async session(): Promise<ScreenResult<SessionInfo>> {
    const decision = this.policy.evaluate("session");
    if (!decision.allowed) {
      return this.fail("session", SCREEN_ERROR_CODES.DENIED, decision.reason ?? "Denied");
    }
    const result = await this.backend.getSessionInfo();
    this.recordFromResult("session", "screen.session", result, null, decision.riskLevel);
    return result;
  }

  async capture(args: {
    displayId?: string;
    confirmed?: boolean;
    taskId?: string | null;
  } = {}): Promise<ScreenResult<ScreenCaptureResult>> {
    const decision = this.policy.evaluate("capture");
    if (!decision.allowed) {
      return this.fail("capture", SCREEN_ERROR_CODES.DENIED, decision.reason ?? "Denied", {
        risk: decision.riskLevel,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    if (this.policy.allowsAutomaticCapture()) {
      return this.fail("capture", SCREEN_ERROR_CODES.DENIED, "Automatic capture forbidden", {
        risk: RiskLevel.HIGH,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    const cap = this.backend.getCapabilityStatus("capture");
    if (cap.status === "PERMISSION_REQUIRED") {
      return this.fail(
        "capture",
        SCREEN_ERROR_CODES.PERMISSION_REQUIRED,
        cap.reason ?? "Screen Recording permission required",
        {
          risk: RiskLevel.HIGH,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
          permissionState: cap.status,
        },
      );
    }
    if (cap.status === "UNAVAILABLE") {
      return this.fail(
        "capture",
        SCREEN_ERROR_CODES.UNAVAILABLE,
        cap.reason ?? "Screen capture unavailable",
        {
          risk: RiskLevel.HIGH,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
          permissionState: cap.status,
        },
      );
    }

    const result = await this.backend.captureScreen({
      displayId: args.displayId,
    });

    if (result.success) {
      // Retention default = 0: service does not keep a copy. Caller owns the buffer.
      this.lastCapture = null;
      this.record({
        action: "capture",
        toolId: "screen.capture",
        targetId: result.data.displayId ?? null,
        riskLevel: RiskLevel.HIGH,
        permissionState: cap.status,
        result: "success",
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
      return result;
    }

    return this.fail("capture", result.error.code, result.error.message, {
      risk: RiskLevel.HIGH,
      confirmation: !!args.confirmed,
      taskId: args.taskId,
      permissionState: cap.status,
    });
  }

  /** Explicitly drop any retained capture buffer. */
  releaseCapture(): void {
    if (this.lastCapture) {
      // Zero-fill then drop reference
      this.lastCapture.image.data.fill(0);
      this.lastCapture = null;
    }
  }

  hasRetainedCapture(): boolean {
    return this.lastCapture !== null;
  }

  private fail(
    action: ScreenAction,
    code: string,
    message: string,
    meta: {
      risk?: RiskLevel;
      confirmation?: boolean;
      taskId?: string | null;
      permissionState?: ScreenCapabilityStatus | null;
    } = {},
  ): ScreenResult<never> {
    const resultKind =
      code === SCREEN_ERROR_CODES.UNAVAILABLE
        ? "unavailable"
        : code === SCREEN_ERROR_CODES.PERMISSION_REQUIRED
          ? "permission_required"
          : code === SCREEN_ERROR_CODES.DENIED
            ? "denied"
            : "error";
    this.record({
      action,
      toolId: `screen.${action === "activeWindow" ? "activeWindow" : action}`,
      targetId: null,
      riskLevel: meta.risk ?? this.policy.riskFor(action),
      permissionState: meta.permissionState ?? null,
      result: resultKind,
      errorCode: code,
      confirmation: meta.confirmation ?? false,
      taskId: meta.taskId,
    });
    return { success: false, error: { code, message } };
  }

  private recordFromResult(
    action: ScreenAction,
    toolId: string,
    result: ScreenResult<unknown>,
    targetId: string | null,
    riskLevel: RiskLevel,
    permissionState: ScreenCapabilityStatus | null = null,
  ): void {
    if (result.success) {
      this.record({
        action,
        toolId,
        targetId,
        riskLevel,
        permissionState,
        result: "success",
      });
    } else {
      const code = result.error.code;
      this.record({
        action,
        toolId,
        targetId,
        riskLevel,
        permissionState,
        result:
          code === SCREEN_ERROR_CODES.UNAVAILABLE
            ? "unavailable"
            : code === SCREEN_ERROR_CODES.PERMISSION_REQUIRED
              ? "permission_required"
              : "error",
        errorCode: code,
      });
    }
  }

  private record(partial: {
    action: ScreenAction;
    toolId: string;
    targetId: string | null;
    riskLevel: RiskLevel;
    permissionState: ScreenCapabilityStatus | null;
    result: "success" | "denied" | "error" | "unavailable" | "permission_required";
    errorCode?: string;
    confirmation?: boolean;
    taskId?: string | null;
  }): void {
    this.audit.append({
      timestamp: new Date().toISOString(),
      taskId: partial.taskId ?? null,
      toolId: partial.toolId,
      action: partial.action,
      targetId: partial.targetId,
      riskLevel: partial.riskLevel,
      permissionState: partial.permissionState,
      result: partial.result,
      errorCode: partial.errorCode,
      backend: this.backend.name,
    });
  }
}
