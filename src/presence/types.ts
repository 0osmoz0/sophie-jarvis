import type { RiskLevel } from "../permissions/RiskLevel.js";

/** Aggregate activity only — never key/mouse content. */
export type UserActivityStatus =
  | "ACTIVE"
  | "IDLE"
  | "JUST_BECAME_IDLE"
  | "JUST_RETURNED"
  | "UNKNOWN";

export type UserActivitySource = "native" | "mock" | "unavailable";

export interface UserActivitySnapshot {
  status: UserActivityStatus;
  idleSeconds: number | null;
  /** Epoch ms for current-state calculation only — not a detailed history. */
  lastActivityAt: number | null;
  observedAt: number;
  source: UserActivitySource;
}

export type UserPresenceKind = "PRESENT" | "IDLE" | "UNKNOWN";

export interface UserPresenceSnapshot {
  presence: UserPresenceKind;
  /** Software indicator only — not physical proof of presence. */
  confidence: number;
  reason: string;
}

export type IdleBucket = "0-5s" | "5-30s" | "30-60s" | "1-5m" | "5m+";

export type UserActivityCapabilityStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "PERMISSION_REQUIRED";

export interface UserActivityCapabilityReport {
  capability: "getActivitySnapshot" | "getIdleDuration";
  status: UserActivityCapabilityStatus;
  permission?: string | null;
  reason?: string | null;
}

export interface UserActivityError {
  code: string;
  message: string;
}

export type UserActivityResult<T> =
  | { success: true; data: T }
  | { success: false; error: UserActivityError };

export interface UserActivityAuditEntry {
  timestamp: string;
  toolId: string;
  taskId: string | null;
  status: UserActivityStatus | null;
  idleBucket: IdleBucket | null;
  capability: string | null;
  result: "success" | "denied" | "error" | "unavailable" | "permission_required";
  errorCode?: string;
  backend?: string | null;
}

export interface UserActivityAuditSink {
  append(entry: UserActivityAuditEntry): void;
  list(): readonly UserActivityAuditEntry[];
}

export interface UserActivityServiceConfig {
  /** Seconds of aggregate idle before transitioning toward IDLE. Default 30. */
  idleThresholdSeconds?: number;
  /** Seconds of activity needed to leave IDLE (hysteresis). Default 2. */
  returnThresholdSeconds?: number;
}

export const USER_ACTIVITY_ERROR_CODES = {
  UNAVAILABLE: "UNAVAILABLE",
  PERMISSION_REQUIRED: "PERMISSION_REQUIRED",
  INVALID_INPUT: "INVALID_INPUT",
  DENIED: "DENIED",
  NATIVE_ERROR: "NATIVE_ERROR",
} as const;

export function idleSecondsToBucket(
  idleSeconds: number | null,
): IdleBucket | null {
  if (idleSeconds === null || !Number.isFinite(idleSeconds) || idleSeconds < 0) {
    return null;
  }
  if (idleSeconds < 5) return "0-5s";
  if (idleSeconds < 30) return "5-30s";
  if (idleSeconds < 60) return "30-60s";
  if (idleSeconds < 300) return "1-5m";
  return "5m+";
}

export function presenceFromActivity(
  status: UserActivityStatus,
): UserPresenceSnapshot {
  switch (status) {
    case "ACTIVE":
    case "JUST_RETURNED":
      return {
        presence: "PRESENT",
        confidence: 1.0,
        reason:
          "Aggregate user activity detected recently (software signal — not physical proof).",
      };
    case "IDLE":
    case "JUST_BECAME_IDLE":
      return {
        presence: "IDLE",
        confidence: 0.6,
        reason:
          "No aggregate user activity detected. IDLE does not prove physical absence.",
      };
    case "UNKNOWN":
    default:
      return {
        presence: "UNKNOWN",
        confidence: 0.0,
        reason: "User activity observation unavailable or unknown.",
      };
  }
}
