import type { EventBus } from "../core/EventBus.js";
import type { UserActivityBackend } from "./UserActivityBackend.js";
import { UserActivityPolicy } from "./UserActivityPolicy.js";
import { MemoryUserActivityAuditLog } from "./UserActivityAuditLog.js";
import { MacOSUserActivityBackend } from "../platform/macos/MacOSUserActivityBackend.js";
import type {
  UserActivityAuditSink,
  UserActivityResult,
  UserActivityServiceConfig,
  UserActivitySnapshot,
  UserActivityStatus,
  UserPresenceSnapshot,
} from "./types.js";
import {
  idleSecondsToBucket,
  presenceFromActivity,
  USER_ACTIVITY_ERROR_CODES,
} from "./types.js";

const DEFAULT_IDLE_THRESHOLD = 30;
const DEFAULT_RETURN_THRESHOLD = 2;

export interface UserActivityServiceOptions extends UserActivityServiceConfig {
  backend?: UserActivityBackend;
  policy?: UserActivityPolicy;
  audit?: UserActivityAuditSink;
  events?: EventBus;
}

/**
 * UserActivityService — aggregate activity state machine.
 * Emits signals only; never triggers captures, animations, or security actions.
 *
 * ACTIVE --(idle >= idleThreshold)--> JUST_BECAME_IDLE --> IDLE
 * IDLE --(idle <= returnThreshold)--> JUST_RETURNED --> ACTIVE
 */
export class UserActivityService {
  readonly backend: UserActivityBackend;
  readonly policy: UserActivityPolicy;
  readonly audit: UserActivityAuditSink;
  private readonly events: EventBus | undefined;
  private readonly idleThresholdSeconds: number;
  private readonly returnThresholdSeconds: number;

  private previousStatus: UserActivityStatus = "UNKNOWN";
  private initialized = false;

  constructor(options: UserActivityServiceOptions = {}) {
    this.backend = options.backend ?? new MacOSUserActivityBackend();
    this.policy = options.policy ?? new UserActivityPolicy();
    this.audit = options.audit ?? new MemoryUserActivityAuditLog();
    this.events = options.events;
    this.idleThresholdSeconds =
      options.idleThresholdSeconds ?? DEFAULT_IDLE_THRESHOLD;
    this.returnThresholdSeconds =
      options.returnThresholdSeconds ?? DEFAULT_RETURN_THRESHOLD;
  }

  getThresholds(): {
    idleThresholdSeconds: number;
    returnThresholdSeconds: number;
  } {
    return {
      idleThresholdSeconds: this.idleThresholdSeconds,
      returnThresholdSeconds: this.returnThresholdSeconds,
    };
  }

  /** Test helper — reset state machine. */
  resetStateMachine(): void {
    this.previousStatus = "UNKNOWN";
    this.initialized = false;
  }

  async getActivity(): Promise<UserActivityResult<UserActivitySnapshot>> {
    const decision = this.policy.evaluate();
    if (!decision.allowed) {
      return this.fail(
        USER_ACTIVITY_ERROR_CODES.DENIED,
        decision.reason ?? "Denied",
        "user.activity",
      );
    }

    const cap = this.backend.getCapabilityStatus("getIdleDuration");
    if (cap.status === "UNAVAILABLE" || cap.status === "PERMISSION_REQUIRED") {
      const code =
        cap.status === "PERMISSION_REQUIRED"
          ? USER_ACTIVITY_ERROR_CODES.PERMISSION_REQUIRED
          : USER_ACTIVITY_ERROR_CODES.UNAVAILABLE;
      const snapshot = unknownSnapshot("unavailable");
      this.commit(snapshot);
      this.record("user.activity", snapshot, "unavailable", code);
      return { success: true, data: snapshot };
    }

    const idleResult = await this.backend.getIdleDuration();
    if (!idleResult.success) {
      const snapshot = unknownSnapshot("unavailable");
      this.commit(snapshot);
      this.record(
        "user.activity",
        snapshot,
        "unavailable",
        idleResult.error.code,
      );
      return { success: true, data: snapshot };
    }

    const idleSeconds = idleResult.data.idleSeconds;
    if (idleSeconds === null || !Number.isFinite(idleSeconds)) {
      const snapshot = unknownSnapshot(
        this.backend.name === "mock" ? "mock" : "unavailable",
      );
      this.commit(snapshot);
      this.record("user.activity", snapshot, "success");
      return { success: true, data: snapshot };
    }

    const now = Date.now();
    const status = this.computeStatus(idleSeconds);
    const snapshot: UserActivitySnapshot = {
      status,
      idleSeconds,
      lastActivityAt: now - idleSeconds * 1000,
      observedAt: now,
      source: this.backend.name === "mock" ? "mock" : "native",
    };

    this.commit(snapshot);
    this.record("user.activity", snapshot, "success");
    return { success: true, data: snapshot };
  }

  async getPresence(): Promise<UserActivityResult<UserPresenceSnapshot>> {
    const activity = await this.getActivity();
    if (!activity.success) return activity;
    const presence = presenceFromActivity(activity.data.status);
    this.record(
      "user.presence",
      activity.data,
      "success",
      undefined,
      "getPresence",
    );
    return { success: true, data: presence };
  }

  private computeStatus(idleSeconds: number): UserActivityStatus {
    const prev = this.previousStatus;
    const idleT = this.idleThresholdSeconds;
    const returnT = this.returnThresholdSeconds;

    if (!this.initialized) {
      return idleSeconds >= idleT ? "IDLE" : "ACTIVE";
    }

    switch (prev) {
      case "ACTIVE":
        return idleSeconds >= idleT ? "JUST_BECAME_IDLE" : "ACTIVE";
      case "JUST_RETURNED":
        return idleSeconds >= idleT ? "JUST_BECAME_IDLE" : "ACTIVE";
      case "JUST_BECAME_IDLE":
        return idleSeconds <= returnT ? "JUST_RETURNED" : "IDLE";
      case "IDLE":
        return idleSeconds <= returnT ? "JUST_RETURNED" : "IDLE";
      case "UNKNOWN":
      default:
        if (idleSeconds >= idleT) return "IDLE";
        if (idleSeconds <= returnT) return "ACTIVE";
        return "UNKNOWN";
    }
  }

  private commit(snapshot: UserActivitySnapshot): void {
    const next = snapshot.status;
    const prev = this.previousStatus;

    if (this.initialized && prev !== next && this.events) {
      this.events.emit("user_activity_changed", {
        previous: prev,
        current: next,
      });
      if (next === "JUST_BECAME_IDLE") {
        this.events.emit("user_became_idle", {
          idleSeconds: snapshot.idleSeconds,
          observedAt: snapshot.observedAt,
        });
      }
      if (next === "JUST_RETURNED") {
        this.events.emit("user_returned", {
          idleSeconds: snapshot.idleSeconds,
          observedAt: snapshot.observedAt,
        });
      }
    }

    this.previousStatus = next;
    this.initialized = true;
  }

  private fail(
    code: string,
    message: string,
    toolId: string,
  ): UserActivityResult<never> {
    this.audit.append({
      timestamp: new Date().toISOString(),
      toolId,
      taskId: null,
      status: null,
      idleBucket: null,
      capability: null,
      result:
        code === USER_ACTIVITY_ERROR_CODES.UNAVAILABLE
          ? "unavailable"
          : code === USER_ACTIVITY_ERROR_CODES.PERMISSION_REQUIRED
            ? "permission_required"
            : "denied",
      errorCode: code,
      backend: this.backend.name,
    });
    return { success: false, error: { code, message } };
  }

  private record(
    toolId: string,
    snapshot: UserActivitySnapshot,
    result:
      | "success"
      | "denied"
      | "error"
      | "unavailable"
      | "permission_required",
    errorCode?: string,
    capability: string | null = "getActivitySnapshot",
  ): void {
    this.audit.append({
      timestamp: new Date().toISOString(),
      toolId,
      taskId: null,
      status: snapshot.status,
      idleBucket: idleSecondsToBucket(snapshot.idleSeconds),
      capability,
      result,
      errorCode,
      backend: this.backend.name,
    });
  }
}

function unknownSnapshot(
  source: UserActivitySnapshot["source"],
): UserActivitySnapshot {
  return {
    status: "UNKNOWN",
    idleSeconds: null,
    lastActivityAt: null,
    observedAt: Date.now(),
    source,
  };
}
