/**
 * Phase 14 — proactive security detection types (ALERT ONLY).
 * Never triggers system actions.
 */

export type SecuritySignalCategory =
  | "USER_PRESENCE"
  | "APPLICATION"
  | "SCREEN"
  | "FILE"
  | "SYSTEM"
  | "SESSION"
  | "ENVIRONMENT";

export type SecuritySeverity =
  | "INFO"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

/** CRITICAL = highest alert severity only — never auto-action. */

export type SecurityPresenceBucket =
  | "ACTIVE"
  | "RECENTLY_IDLE"
  | "IDLE"
  | "LONG_IDLE"
  | "UNKNOWN";

export interface SecurityEvidenceItem {
  key: string;
  value: string;
}

export interface SecuritySignal {
  id: string;
  category: SecuritySignalCategory;
  kind: string;
  severity: SecuritySeverity;
  confidence: number;
  timestamp: number;
  source: string;
  evidence: SecurityEvidenceItem[];
  reason: string;
}

export interface SecurityObservationApp {
  id?: string | null;
  name?: string | null;
  bundleId?: string | null;
}

export interface SecurityObservationFile {
  /** Basename or relative key only — never file contents. */
  key: string;
  mtimeMs?: number | null;
  size?: number | null;
  exists?: boolean;
  extension?: string | null;
}

/**
 * Plain observation bag — no service imports.
 * Wired from ContextSnapshot / mocks by callers.
 */
export interface SecurityObservationInput {
  timestamp: number;
  idleSeconds?: number | null;
  activityState?: string | null;
  applications?: SecurityObservationApp[];
  activeApplication?: SecurityObservationApp | null;
  windows?: Array<{
    id?: string | null;
    applicationName?: string | null;
  }>;
  activeWindow?: { applicationName?: string | null } | null;
  files?: SecurityObservationFile[];
  system?: {
    memoryFreeBytes?: number | null;
    memoryTotalBytes?: number | null;
    uptimeSeconds?: number | null;
    applicationCount?: number | null;
  };
  sessionLocked?: boolean | null;
}

export interface SecurityBaselineSnapshot {
  timestamp: number;
  applicationKeys: string[];
  activeKey: string | null;
  windowAppKeys: string[];
  fileFingerprints: Array<{ key: string; mtimeMs: number | null; size: number | null }>;
  idleSeconds: number | null;
  memoryFreeBytes: number | null;
  uptimeSeconds: number | null;
  applicationCount: number | null;
}

export interface ThreatAssessment {
  level: SecuritySeverity;
  confidence: number;
  reasons: string[];
  evidence: SecurityEvidenceItem[];
  signals: SecuritySignal[];
  presence: SecurityPresenceBucket;
  requiresUserAttention: boolean;
  /** Explicit disclaimer — never claims malware/hacker. */
  disclaimer: string;
}

export interface SecurityAlert {
  id: string;
  level: SecuritySeverity;
  confidence: number;
  title: string;
  summary: string;
  reasons: string[];
  evidence: SecurityEvidenceItem[];
  timestamp: number;
  requiresUserAttention: boolean;
  category: SecuritySignalCategory | "CORRELATED";
}

export interface SecurityServiceStatus {
  baselineReady: boolean;
  baselineAgeMs: number | null;
  signalCount: number;
  alertCount: number;
  lastAssessment: ThreatAssessment | null;
  mode: "DETECTION_ONLY";
}

export interface SecurityTiming {
  signalCollectionMs: number;
  baselineMs: number;
  assessmentMs: number;
  correlationMs: number;
  alertFormattingMs: number;
  totalSecurityMs: number;
}

export interface SecurityAssessResult {
  assessment: ThreatAssessment;
  alerts: SecurityAlert[];
  signals: SecuritySignal[];
  timing: SecurityTiming;
}

export interface SecurityAuditEntry {
  timestamp: string;
  toolId: string;
  action: "status" | "alerts" | "assess" | "baseline";
  signalCount: number;
  alertCount: number;
  level: SecuritySeverity | null;
  result: "success" | "error";
  latencyMs: number;
}

export interface SecurityAuditSink {
  append(entry: SecurityAuditEntry): void;
  list(): readonly SecurityAuditEntry[];
}

export const SECURITY_DISCLAIMER =
  "JARVIS reports anomalies and unusual patterns only. This is not virus, malware, or intrusion confirmation.";

export const SEVERITY_ORDER: Record<SecuritySeverity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};
