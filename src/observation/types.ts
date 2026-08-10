/**
 * Observation layer types — Phase 2 (+ Phase 7 optional presence fields).
 * Unreachable values MUST be null (never invented).
 */

import type {
  UserActivitySnapshot,
  UserPresenceSnapshot,
} from "../presence/types.js";

/** Coarse availability for an observation domain. */
export type ObservationAvailability =
  | "available"
  | "unavailable"
  | "permission_required"
  | "error";

export interface ObservationDomainMeta {
  availability: ObservationAvailability;
  /** Human-readable reason when not available. */
  reason: string | null;
}

export interface CpuInfo {
  model: string | null;
  speedMHz: number | null;
  cores: number | null;
}

export interface MemoryInfo {
  totalBytes: number | null;
  freeBytes: number | null;
}

export interface BatteryInfo {
  /** Phase 2: Node has no portable battery API without native/shell — usually null. */
  percent: number | null;
  charging: boolean | null;
  available: boolean;
  reason: string | null;
}

export interface SystemObservation extends ObservationDomainMeta {
  platform: string | null;
  arch: string | null;
  hostname: string | null;
  cpu: CpuInfo | null;
  memory: MemoryInfo | null;
  uptimeSeconds: number | null;
  battery: BatteryInfo | null;
}

export interface ProcessInfo {
  pid: number | null;
  name: string | null;
  commandLine: string | null;
  cpuUsage: number | null;
  memoryBytes: number | null;
}

export interface ProcessObservation extends ObservationDomainMeta {
  /** null when listing is unavailable (no shell / no native binding). */
  processes: ProcessInfo[] | null;
}

export interface ApplicationInfo {
  id?: string | null;
  name: string | null;
  bundleId?: string | null;
  status?: string | null;
}

export interface ApplicationObservation extends ObservationDomainMeta {
  applications: ApplicationInfo[] | null;
  activeApplication: ApplicationInfo | null;
}

export type UserActivityState = "ACTIVE" | "IDLE" | "UNKNOWN";

export interface UserActivityObservation extends ObservationDomainMeta {
  state: UserActivityState;
  /** Last input activity timestamp if known — never keystroke content. */
  lastActivityAt: string | null;
  idleDurationMs: number | null;
  /** Explicit: we never store key content or mouse coordinates. */
  recordsKeyContent: false;
  recordsMouseCoordinates: false;
}

export interface FileEntryObservation {
  path: string;
  name: string;
  isDirectory: boolean;
  sizeBytes: number | null;
  modifiedAt: string | null;
}

export interface FileObservation extends ObservationDomainMeta {
  /** Explicitly configured paths only. Default: []. */
  configuredPaths: string[];
  entries: FileEntryObservation[];
}

export interface ScreenSnapshot {
  /** false in Phase 2 — no screen capture, no Screen Recording permission. */
  available: boolean;
  width?: number;
  height?: number;
  displayCount?: number;
  /** Always null in Phase 2 — no image buffers. */
  imageData: null;
  reason: string | null;
}

export interface ObservationSnapshot {
  timestamp: string;
  system: SystemObservation;
  processes: ProcessObservation;
  applications: ApplicationObservation;
  activeApplication: ApplicationInfo | null;
  /** Phase 2 coarse activity (UNKNOWN when no native idle). */
  userActivity: UserActivityObservation;
  files: FileObservation;
  screen: ScreenSnapshot;
  /**
   * Phase 7 — aggregate activity signal from UserActivityService.
   * Optional for backward compatibility.
   */
  activitySignal?: UserActivitySnapshot | null;
  /**
   * Phase 7 — presence inference (IDLE ≠ physical absence).
   */
  userPresence?: UserPresenceSnapshot | null;
}

export interface FileObserverConfig {
  /** Absolute paths to observe (read-only). Default empty — observe nothing. */
  paths: string[];
}

export interface ObservationServiceConfig {
  /** File observation config (default: no paths). */
  files?: FileObserverConfig;
  /** In-memory cache TTL in milliseconds. */
  cacheTtlMs?: number;
}
