import type { RiskLevel } from "../permissions/RiskLevel.js";

/** Application identity — never invent fields; use null when unknown. */
export interface ApplicationInfo {
  id?: string | null;
  name: string;
  bundleId?: string | null;
  path?: string | null;
  running: boolean | null;
  active?: boolean | null;
}

export interface ApplicationError {
  code: string;
  message: string;
}

export type ApplicationResult<T = ApplicationInfo> =
  | { success: true; data: T }
  | { success: false; error: ApplicationError };

/** Explicit registry entry — configured, not discovered via shell. */
export interface RegisteredApplication {
  id: string;
  name: string;
  bundleId?: string | null;
  path?: string | null;
  /** Optional aliases for resolver matching (lowercase). */
  aliases?: string[];
}

export type ApplicationAction = "list" | "info" | "active" | "open" | "close";

export interface ApplicationAuditEntry {
  timestamp: string;
  taskId: string | null;
  toolId: string;
  action: ApplicationAction;
  application: string | null;
  bundleId: string | null;
  riskLevel: RiskLevel;
  confirmation: boolean;
  result: "success" | "denied" | "error" | "unavailable" | "permission_required";
  errorCode?: string;
  /** Phase 5 — optional backend metadata (never window/PII content). */
  backend?: string | null;
  capability?: string | null;
  nativeStatus?: string | null;
}

export interface ApplicationAuditSink {
  append(entry: ApplicationAuditEntry): void;
  list(): readonly ApplicationAuditEntry[];
}

export const APPLICATION_ERROR_CODES = {
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_IDENTITY: "INVALID_IDENTITY",
  NOT_FOUND: "NOT_FOUND",
  APPLICATION_NOT_FOUND: "APPLICATION_NOT_FOUND",
  DENIED: "DENIED",
  APPLICATION_DENIED: "APPLICATION_DENIED",
  DENYLIST: "DENYLIST",
  BLOCKED_PATH: "BLOCKED_PATH",
  UNAVAILABLE: "UNAVAILABLE",
  PERMISSION_REQUIRED: "PERMISSION_REQUIRED",
  NOT_RUNNING: "NOT_RUNNING",
  APPLICATION_NOT_RUNNING: "APPLICATION_NOT_RUNNING",
  ALREADY_RUNNING: "ALREADY_RUNNING",
  UNSUPPORTED: "UNSUPPORTED",
  NATIVE_ERROR: "NATIVE_ERROR",
} as const;

/** System apps that must never be closed by JARVIS. */
export const DENIED_SYSTEM_APPLICATIONS = [
  "Finder",
  "Dock",
  "WindowServer",
  "loginwindow",
  "launchd",
  "SystemUIServer",
] as const;

export const DENIED_SYSTEM_BUNDLE_IDS = [
  "com.apple.finder",
  "com.apple.dock",
  "com.apple.WindowServer",
  "com.apple.loginwindow",
  "com.apple.systemuiserver",
] as const;
