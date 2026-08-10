import type { UserActivityBackend } from "./UserActivityBackend.js";
import type {
  UserActivityCapabilityReport,
  UserActivityResult,
  UserActivitySnapshot,
  UserActivityStatus,
} from "./types.js";
import { USER_ACTIVITY_ERROR_CODES } from "./types.js";

/**
 * In-memory activity backend for tests — no real input observation.
 */
export class MockUserActivityBackend implements UserActivityBackend {
  readonly name = "mock";

  private idleSeconds = 0;
  private unavailable = false;
  private forcedStatus: UserActivityStatus | null = null;

  getCapabilityStatus(
    capability: "getActivitySnapshot" | "getIdleDuration",
  ): UserActivityCapabilityReport {
    if (this.unavailable) {
      return {
        capability,
        status: "UNAVAILABLE",
        reason: "Mock backend set to unavailable.",
      };
    }
    return {
      capability,
      status: "AVAILABLE",
      reason: "Mock backend — aggregate idle only.",
    };
  }

  setIdleSeconds(seconds: number): void {
    this.idleSeconds = Math.max(0, seconds);
    this.forcedStatus = null;
  }

  /** Force a status for transition tests (still aggregate-only). */
  setForcedStatus(status: UserActivityStatus | null): void {
    this.forcedStatus = status;
  }

  setUnavailable(unavailable: boolean): void {
    this.unavailable = unavailable;
  }

  async getIdleDuration(): Promise<
    UserActivityResult<{ idleSeconds: number | null }>
  > {
    if (this.unavailable) {
      return {
        success: false,
        error: {
          code: USER_ACTIVITY_ERROR_CODES.UNAVAILABLE,
          message: "Mock user activity unavailable",
        },
      };
    }
    return { success: true, data: { idleSeconds: this.idleSeconds } };
  }

  async getActivitySnapshot(): Promise<UserActivityResult<UserActivitySnapshot>> {
    if (this.unavailable) {
      return {
        success: false,
        error: {
          code: USER_ACTIVITY_ERROR_CODES.UNAVAILABLE,
          message: "Mock user activity unavailable",
        },
      };
    }
    const now = Date.now();
    const status =
      this.forcedStatus ??
      (this.idleSeconds >= 30 ? "IDLE" : "ACTIVE");
    return {
      success: true,
      data: {
        status,
        idleSeconds: this.idleSeconds,
        lastActivityAt: now - this.idleSeconds * 1000,
        observedAt: now,
        source: "mock",
      },
    };
  }
}
