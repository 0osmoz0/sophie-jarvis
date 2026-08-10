import type { RiskLevel } from "../permissions/RiskLevel.js";

export interface ScreenBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenInfo {
  id: string;
  width: number;
  height: number;
  scaleFactor?: number | null;
  isPrimary?: boolean | null;
  bounds?: ScreenBounds | null;
}

export interface WindowInfo {
  id: string;
  title?: string | null;
  applicationName?: string | null;
  bundleId?: string | null;
  bounds?: ScreenBounds | null;
  minimized?: boolean | null;
  visible?: boolean | null;
  active?: boolean | null;
}

export interface SessionInfo {
  locked: boolean | null;
  userPresent: boolean | null;
}

/** In-memory screenshot — never persisted by default. Retention = 0. */
export interface ScreenImage {
  format: "png";
  width: number;
  height: number;
  /** Opaque buffer reference — not logged. */
  data: Uint8Array;
}

export interface ScreenCaptureResult {
  image: ScreenImage;
  displayId?: string | null;
}

export interface ScreenError {
  code: string;
  message: string;
}

export type ScreenResult<T> =
  | { success: true; data: T }
  | { success: false; error: ScreenError };

export type ScreenAction =
  | "info"
  | "windows"
  | "activeWindow"
  | "session"
  | "capture";

export type ScreenCapabilityStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "PERMISSION_REQUIRED";

export interface ScreenCapabilityReport {
  capability: ScreenAction | string;
  status: ScreenCapabilityStatus;
  permission?: string | null;
  reason?: string | null;
}

export interface ScreenAuditEntry {
  timestamp: string;
  taskId: string | null;
  toolId: string;
  action: ScreenAction;
  /** Screen/window identity only — never pixels or titles of sensitive docs beyond id. */
  targetId: string | null;
  riskLevel: RiskLevel;
  permissionState: ScreenCapabilityStatus | null;
  result: "success" | "denied" | "error" | "unavailable" | "permission_required";
  errorCode?: string;
  backend?: string | null;
  /** Never stores screenshot bytes. */
}

export interface ScreenAuditSink {
  append(entry: ScreenAuditEntry): void;
  list(): readonly ScreenAuditEntry[];
}

export const SCREEN_ERROR_CODES = {
  UNAVAILABLE: "UNAVAILABLE",
  PERMISSION_REQUIRED: "PERMISSION_REQUIRED",
  INVALID_INPUT: "INVALID_INPUT",
  DENIED: "DENIED",
  NATIVE_ERROR: "NATIVE_ERROR",
  NOT_FOUND: "NOT_FOUND",
} as const;
