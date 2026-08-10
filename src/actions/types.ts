import { RiskLevel } from "../permissions/RiskLevel.js";

/** Explicit typed actions only — never a generic/shell command. */
export type ActionType =
  | "FILE_COPY"
  | "FILE_MOVE"
  | "FILE_CREATE"
  | "FILE_DELETE"
  | "APP_OPEN"
  | "APP_CLOSE";

export type ActionPlanStatus =
  | "PLANNED"
  | "CONFIRMATION_REQUIRED"
  | "APPROVED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "DENIED"
  | "CANCELLED";

export interface FileCopyPayload {
  source: string;
  destination: string;
  overwrite?: boolean;
}

export interface FileMovePayload {
  source: string;
  destination: string;
  overwrite?: boolean;
}

export interface FileCreatePayload {
  path: string;
  content?: string;
  overwrite?: boolean;
}

export interface FileDeletePayload {
  path: string;
}

export interface AppOpenPayload {
  applicationId: string;
}

export interface AppClosePayload {
  applicationId: string;
}

export type ActionPayload =
  | FileCopyPayload
  | FileMovePayload
  | FileCreatePayload
  | FileDeletePayload
  | AppOpenPayload
  | AppClosePayload;

export interface ActionIntent {
  type: ActionType;
  payload: Record<string, unknown>;
}

export interface ActionPlan {
  taskId: string;
  actionType: ActionType;
  payload: ActionPayload;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  status: ActionPlanStatus;
  createdAt: number;
  dryRun?: boolean;
  confirmationMessage?: string;
  resultCode?: string | null;
  errorMessage?: string | null;
  completedAt?: number | null;
}

export interface ActionConfirmationToken {
  taskId: string;
  actionType: ActionType;
  payloadHash: string;
  expiresAt: number;
}

export interface ActionConfirmationRequest {
  taskId: string;
  actionType: ActionType;
  message: string;
  riskLevel: RiskLevel;
  expiresAt: number;
}

export type ActionRollbackAvailability =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "UNSUPPORTED";

export interface ActionRollbackInfo {
  availability: ActionRollbackAvailability;
  reason: string;
}

export interface ActionAuditEntry {
  timestamp: string;
  taskId: string;
  actionType: ActionType | "UNKNOWN";
  riskLevel: RiskLevel | null;
  confirmationState: string;
  status: ActionPlanStatus | "ERROR";
  resultCode: string;
  /** Minimal metadata only — never file contents or secrets. */
  meta?: Record<string, string | number | boolean | null>;
}

export interface ActionAuditSink {
  append(entry: ActionAuditEntry): void;
  list(): readonly ActionAuditEntry[];
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export const ACTION_ERROR_CODES = {
  UNKNOWN_ACTION: "UNKNOWN_ACTION",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  DENIED: "DENIED",
  CRITICAL_DENIED: "CRITICAL_DENIED",
  CONFIRMATION_REQUIRED: "CONFIRMATION_REQUIRED",
  INVALID_CONFIRMATION: "INVALID_CONFIRMATION",
  EXPIRED_CONFIRMATION: "EXPIRED_CONFIRMATION",
  CROSS_TASK_CONFIRMATION: "CROSS_TASK_CONFIRMATION",
  ALREADY_COMPLETED: "ALREADY_COMPLETED",
  INVALID_STATE: "INVALID_STATE",
  CANCEL_UNAVAILABLE: "CANCEL_UNAVAILABLE",
  TIMEOUT: "TIMEOUT",
  EXECUTION_FAILED: "EXECUTION_FAILED",
  ROLLBACK_UNAVAILABLE: "ROLLBACK_UNAVAILABLE",
  FORBIDDEN_FIELD: "FORBIDDEN_FIELD",
  NOT_FOUND: "NOT_FOUND",
} as const;

/** Keys never allowed on action payloads. */
export const FORBIDDEN_PAYLOAD_KEYS = [
  "command",
  "shell",
  "executable",
  "script",
  "args",
  "argv",
  "eval",
  "code",
] as const;

export function isActionType(value: unknown): value is ActionType {
  return (
    typeof value === "string" &&
    [
      "FILE_COPY",
      "FILE_MOVE",
      "FILE_CREATE",
      "FILE_DELETE",
      "APP_OPEN",
      "APP_CLOSE",
    ].includes(value)
  );
}
