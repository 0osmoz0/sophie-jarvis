/**
 * Phase 11 — unified ContextSnapshot (read-only, never invents data).
 */

export type DomainStatus =
  | "available"
  | "unavailable"
  | "unknown"
  | "permission_required"
  | "error";

export interface ContextSystemInfo {
  status: DomainStatus;
  os?: string;
  architecture?: string;
  hostname?: string | null;
  cpu?: {
    model?: string | null;
    cores?: number | null;
    speedMHz?: number | null;
  };
  memory?: {
    totalBytes?: number | null;
    freeBytes?: number | null;
  };
  uptimeSeconds?: number | null;
  reason?: string | null;
}

export interface ContextApplicationEntry {
  id?: string | null;
  name?: string | null;
  bundleId?: string | null;
}

export interface ContextApplicationsInfo {
  status: DomainStatus;
  active?: ContextApplicationEntry | null;
  running?: ContextApplicationEntry[];
  reason?: string | null;
}

export interface ContextDisplayEntry {
  id?: string | null;
  width?: number | null;
  height?: number | null;
  isPrimary?: boolean | null;
  /** Phase 24 — when backend provides it. */
  scaleFactor?: number | null;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface ContextWindowEntry {
  id?: string | null;
  title?: string | null;
  applicationName?: string | null;
  bundleId?: string | null;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface ContextScreenInfo {
  status: DomainStatus;
  displays?: ContextDisplayEntry[];
  windows?: ContextWindowEntry[];
  activeWindow?: ContextWindowEntry | null;
  /** Phase 24 — from ScreenService.session(); nulls stay null (never invent). */
  session?: {
    locked: boolean | null;
    userPresent: boolean | null;
    status: DomainStatus;
  } | null;
  reason?: string | null;
}

export interface ContextActivityInfo {
  status: DomainStatus;
  state?: string | null;
  idleSeconds?: number | null;
  reason?: string | null;
}

export interface ContextPresenceInfo {
  status: DomainStatus;
  presence?: string | null;
  confidence?: number | null;
  reason?: string | null;
}

export interface ContextFilesInfo {
  status: DomainStatus;
  configuredPaths?: string[];
  entryCount?: number | null;
  reason?: string | null;
}

/** Relevant memories only — never the full store (Phase 16). */
export interface ContextMemoryInfo {
  status: DomainStatus;
  count?: number;
  relevant?: Array<{
    id: string;
    kind: string;
    content: string;
    confidence: number;
  }>;
  reason?: string | null;
}

/** Ephemeral Sophie signals (Phase 12) — never invents; may be absent. */
export interface ContextSophieSignals {
  lastSophieInteraction: { type: string; timestamp: number } | null;
  lastMediaEvent: { type: string; timestamp: number } | null;
  lastUserSignal: { type: string; timestamp: number } | null;
}

export interface ContextSnapshot {
  timestamp: number;
  system: ContextSystemInfo;
  applications: ContextApplicationsInfo;
  screen: ContextScreenInfo;
  activity: ContextActivityInfo;
  presence: ContextPresenceInfo;
  files: ContextFilesInfo;
  /** Present only when a memory source is wired; relevant subset only. */
  memory?: ContextMemoryInfo;
  /** Present only when a SophieIntegration signal source is wired. */
  sophie?: ContextSophieSignals;
}

export type ContextQueryKind =
  | "system.context"
  | "system.status"
  | "application.status"
  | "screen.status"
  | "user.status";

export interface ContextTiming {
  systemMs: number;
  applicationMs: number;
  screenMs: number;
  activityMs: number;
  totalMs: number;
  contextSnapshotMs: number;
  /** Phase 24 — null when subsection not executed. */
  sessionMs?: number | null;
  windowMs?: number | null;
  cursorMs?: number | null;
  audioMs?: number | null;
  aggregationMs?: number | null;
}

export interface ContextServiceResult {
  snapshot: ContextSnapshot;
  timing: ContextTiming;
  query: ContextQueryKind;
}

export interface ContextAuditEntry {
  timestamp: string;
  toolId: string;
  query: ContextQueryKind;
  systemStatus: DomainStatus;
  applicationsStatus: DomainStatus;
  screenStatus: DomainStatus;
  activityStatus: DomainStatus;
  presenceStatus: DomainStatus;
  filesStatus: DomainStatus;
  result: "success" | "error";
  latencyMs: number;
}

export interface ContextAuditSink {
  append(entry: ContextAuditEntry): void;
  list(): readonly ContextAuditEntry[];
}
