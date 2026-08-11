/**
 * Phase 15 — Security Monitor types (MONITORING + ALERT ONLY).
 * Never triggers system actions.
 */

import type {
  SecurityAlert,
  SecurityEvidenceItem,
  SecurityObservationInput,
  SecuritySeverity,
  SecuritySignal,
  ThreatAssessment,
} from "./types.js";
import { SEVERITY_ORDER } from "./types.js";

export type SecurityMonitorRunStatus =
  | "DISABLED"
  | "IDLE"
  | "OBSERVING"
  | "ASSESSING"
  | "ALERT"
  | "ERROR"
  | "UNAVAILABLE";

export type SecuritySourceAvailability =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "LIMITED"
  | "UNKNOWN";

export interface SecuritySourceReport {
  system: SecuritySourceAvailability;
  applications: SecuritySourceAvailability;
  screen: SecuritySourceAvailability;
  activity: SecuritySourceAvailability;
  files: SecuritySourceAvailability;
}

export interface SecurityMonitorConfig {
  enabled: boolean;
  /** Default 30s — conservative. */
  observationIntervalMs: number;
  /** Minimum enforced interval (floor). */
  minObservationIntervalMs: number;
  /** Skip assess if last assess was more recent than this. */
  assessmentCooldownMs: number;
  /** Suppress duplicate Sophie/onAlert emissions within this window. */
  alertCooldownMs: number;
  /** Soft-update baseline only when assessment level is at/below this. */
  baselineAbsorbMaxLevel: SecuritySeverity;
}

export const DEFAULT_SECURITY_MONITOR_CONFIG: SecurityMonitorConfig = {
  enabled: false,
  observationIntervalMs: 30_000,
  minObservationIntervalMs: 5_000,
  assessmentCooldownMs: 10_000,
  alertCooldownMs: 60_000,
  baselineAbsorbMaxLevel: "LOW",
};

export interface SecurityMonitorState {
  enabled: boolean;
  lastObservationAt: number | null;
  lastAssessmentAt: number | null;
  lastAlertAt: number | null;
  assessmentCount: number;
  alertCount: number;
  status: SecurityMonitorRunStatus;
}

export interface SecurityMonitorTiming {
  observationMs: number;
  contextMs: number;
  signalMs: number;
  baselineMs: number;
  assessmentMs: number;
  correlationMs: number;
  alertMs: number;
  totalMs: number;
}

export interface SecurityMonitorTickResult {
  status: SecurityMonitorRunStatus;
  assessment: ThreatAssessment | null;
  alerts: SecurityAlert[];
  signals: SecuritySignal[];
  emittedAlerts: SecurityAlert[];
  skipped: boolean;
  skipReason?: string;
  timing: SecurityMonitorTiming;
  error?: string;
}

export interface SecurityMonitorStatusReport {
  monitor: SecurityMonitorState;
  config: SecurityMonitorConfig;
  currentRisk: SecuritySeverity | "NONE";
  sources: SecuritySourceReport;
  lastTiming: SecurityMonitorTiming | null;
  mode: "MONITORING_ALERT_ONLY";
  disclaimer: string;
}

/** Deduplicated alert view with occurrence tracking (no sensitive payloads). */
export interface DedupedSecurityAlert extends SecurityAlert {
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
  fingerprint: string;
}

export interface SecurityMonitorOptions {
  /** Injected observation provider — must NOT be ActionExecutor/FileService/etc. */
  getObservation: () =>
    | Promise<SecurityObservationInput>
    | SecurityObservationInput;
  /** Optional: map domain availability (caller-owned). */
  getSources?: () => SecuritySourceReport | Promise<SecuritySourceReport>;
  config?: Partial<SecurityMonitorConfig>;
  now?: () => number;
  /** Alert metadata notifier (e.g. Sophie) — never actions. */
  onAlert?: (alert: DedupedSecurityAlert) => void;
  /**
   * Controlled scheduler — default uses recursive setTimeout (NOT setInterval).
   * Tests may inject a manual scheduler.
   */
  schedule?: (fn: () => void, delayMs: number) => { cancel: () => void };
}

export function clampMonitorInterval(
  requestedMs: number,
  minMs: number,
): number {
  if (!Number.isFinite(requestedMs) || requestedMs <= 0) return Math.max(minMs, 30_000);
  return Math.max(minMs, Math.floor(requestedMs));
}

export function emptyTiming(): SecurityMonitorTiming {
  return {
    observationMs: 0,
    contextMs: 0,
    signalMs: 0,
    baselineMs: 0,
    assessmentMs: 0,
    correlationMs: 0,
    alertMs: 0,
    totalMs: 0,
  };
}

export function defaultSources(): SecuritySourceReport {
  return {
    system: "UNKNOWN",
    applications: "UNKNOWN",
    screen: "UNKNOWN",
    activity: "UNKNOWN",
    files: "UNKNOWN",
  };
}

export { SEVERITY_ORDER };
export type { SecurityEvidenceItem };
