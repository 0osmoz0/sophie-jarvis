/**
 * Phase 24 — EnvironmentContext model (observation + normalize only).
 * Phase 25 — cursor motion, focused window (AX), audio metadata.
 */

import { emptyAudioContext, type AudioContext } from "./AudioContext.js";
import { emptyCursorContext, type CursorContext } from "./CursorContext.js";
import {
  emptyFocusedWindowContext,
  type FocusedWindowContext,
} from "./FocusedWindowContext.js";

export type { CursorContext, AudioContext, FocusedWindowContext };

export type EnvAvailability =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "PERMISSION_REQUIRED"
  | "UNKNOWN";

export type FreshnessStatus = "FRESH" | "STALE" | "UNKNOWN";

export type UserActivityLevel =
  | "ACTIVE"
  | "RECENTLY_ACTIVE"
  | "IDLE"
  | "UNKNOWN";

export type EnvironmentChangeType =
  | "APPLICATION_CHANGED"
  | "ACTIVE_APPLICATION_CHANGED"
  | "WINDOW_CHANGED"
  | "FOCUSED_WINDOW_CHANGED"
  | "SCREEN_CHANGED"
  | "SESSION_CHANGED"
  | "USER_ACTIVITY_CHANGED"
  | "AUDIO_STATE_CHANGED"
  | "AUDIO_PLAYBACK_STARTED"
  | "AUDIO_PLAYBACK_STOPPED"
  | "AUDIO_TRACK_CHANGED"
  | "CURSOR_MOVED"
  | "CURSOR_ENTERED_PROXIMITY"
  | "CURSOR_LEFT_PROXIMITY";

export type AudioCapabilityKind =
  | "DIRECTLY_AVAILABLE"
  | "MACOS_API"
  | "PERMISSION_REQUIRED"
  | "EXTERNAL_INTEGRATION"
  | "UNAVAILABLE";

export interface ContextFreshness {
  observedAt: number | null;
  ageMs: number | null;
  status: FreshnessStatus;
}

export interface EnvBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EnvDisplay {
  id: string;
  width: number | null;
  height: number | null;
  scaleFactor: number | null;
  isPrimary: boolean | null;
  bounds: EnvBounds | null;
}

export interface EnvApplicationRef {
  id: string | null;
  name: string | null;
  bundleId: string | null;
}

export interface EnvWindowRef {
  id: string | null;
  title: string | null;
  applicationName: string | null;
  bundleId: string | null;
  bounds: EnvBounds | null;
}

export interface EnvironmentScreenSection {
  available: EnvAvailability;
  observedAt: number | null;
  source: string;
  displays: EnvDisplay[];
  primaryDisplay: EnvDisplay | null;
  width: number | null;
  height: number | null;
  scaleFactor: number | null;
  displayCount: number;
  globalBounds: EnvBounds | null;
  reason?: string | null;
}

export interface EnvironmentApplicationSection {
  available: EnvAvailability;
  observedAt: number | null;
  source: string;
  active: EnvApplicationRef | null;
  runningCount: number | null;
  recentApplications: EnvApplicationRef[];
  reason?: string | null;
}

export interface EnvironmentWindowSection {
  available: EnvAvailability;
  observedAt: number | null;
  source: string;
  active: EnvWindowRef | null;
  titleAvailable: boolean;
  boundsAvailable: boolean;
  reason?: string | null;
}

export interface EnvironmentUserActivitySection {
  available: EnvAvailability;
  observedAt: number | null;
  source: string;
  idleSeconds: number | null;
  activityLevel: UserActivityLevel;
  /** IDLE ≠ ABSENT — presence is separate / often UNKNOWN. */
  reason?: string | null;
}

export interface EnvironmentSessionSection {
  available: EnvAvailability;
  observedAt: number | null;
  source: string;
  locked: boolean | null;
  userPresent: boolean | null;
  /** Never coerce UNKNOWN → false. */
  reason?: string | null;
}

export interface EnvironmentCursorSection {
  /** @deprecated use CursorContext — kept for compatibility */
  available: EnvAvailability;
  observedAt: number | null;
  source: string;
  position: { x: number; y: number } | null;
  velocity: number | null;
  moving: boolean | null;
  reason?: string | null;
}

export interface EnvironmentAudioSection {
  available: EnvAvailability;
  observedAt: number | null;
  source: string;
  capabilityKind: AudioCapabilityKind;
  activeApplication: string | null;
  playing: boolean | null;
  volume: number | null;
  reason?: string | null;
}

export type PermissionReportState =
  | "AVAILABLE"
  | "REQUIRED"
  | "DENIED"
  | "UNKNOWN";

export interface EnvironmentPermissionsSection {
  accessibility: PermissionReportState;
  screenRecording: PermissionReportState;
  microphone: PermissionReportState;
  observedAt: number | null;
  source: string;
}

export interface EnvironmentContext {
  timestamp: number;
  screen: EnvironmentScreenSection;
  application: EnvironmentApplicationSection;
  window: EnvironmentWindowSection;
  focusedWindow: FocusedWindowContext;
  userActivity: EnvironmentUserActivitySection;
  session: EnvironmentSessionSection;
  cursor: CursorContext;
  audio: AudioContext;
  permissions: EnvironmentPermissionsSection;
  freshness: ContextFreshness;
}

export interface EnvironmentChange {
  type: EnvironmentChangeType;
  previous: string | null;
  current: string | null;
  timestamp: number;
}

export interface EnvironmentTiming {
  screenMs: number | null;
  applicationMs: number | null;
  windowMs: number | null;
  activityMs: number | null;
  sessionMs: number | null;
  cursorMs: number | null;
  focusMs: number | null;
  axMs: number | null;
  audioMs: number | null;
  aggregationMs: number | null;
  totalContextMs: number;
}

export interface EnvironmentSnapshotResult {
  environment: EnvironmentContext;
  timing: EnvironmentTiming;
  changes: EnvironmentChange[];
}

export const ENVIRONMENT_LIMITS = {
  maxChangeHistory: 64,
  freshMs: 2_000,
  staleMs: 15_000,
  maxRecentApplications: 12,
} as const;

export function computeFreshness(
  observedAt: number | null,
  now: number,
  freshMs = ENVIRONMENT_LIMITS.freshMs,
  staleMs = ENVIRONMENT_LIMITS.staleMs,
): ContextFreshness {
  if (observedAt == null || !Number.isFinite(observedAt)) {
    return { observedAt: null, ageMs: null, status: "UNKNOWN" };
  }
  const ageMs = Math.max(0, now - observedAt);
  if (ageMs <= freshMs) {
    return { observedAt, ageMs, status: "FRESH" };
  }
  if (ageMs >= staleMs) {
    return { observedAt, ageMs, status: "STALE" };
  }
  return { observedAt, ageMs, status: "FRESH" };
}

export function classifyActivityLevel(
  idleSeconds: number | null,
): UserActivityLevel {
  if (idleSeconds == null || !Number.isFinite(idleSeconds)) return "UNKNOWN";
  if (idleSeconds < 30) return "ACTIVE";
  if (idleSeconds < 180) return "RECENTLY_ACTIVE";
  return "IDLE";
}

export function emptyEnvironment(now = Date.now()): EnvironmentContext {
  const unavailable = (
    source: string,
    reason: string,
  ): Pick<
    EnvironmentScreenSection,
    "available" | "observedAt" | "source" | "reason"
  > => ({
    available: "UNAVAILABLE",
    observedAt: null,
    source,
    reason,
  });

  return {
    timestamp: now,
    screen: {
      ...unavailable("none", "No screen source"),
      displays: [],
      primaryDisplay: null,
      width: null,
      height: null,
      scaleFactor: null,
      displayCount: 0,
      globalBounds: null,
    },
    application: {
      ...unavailable("none", "No application source"),
      active: null,
      runningCount: null,
      recentApplications: [],
    },
    window: {
      ...unavailable("none", "No window source"),
      active: null,
      titleAvailable: false,
      boundsAvailable: false,
    },
    focusedWindow: emptyFocusedWindowContext(),
    userActivity: {
      available: "UNKNOWN",
      observedAt: null,
      source: "none",
      idleSeconds: null,
      activityLevel: "UNKNOWN",
      reason: "No activity source",
    },
    session: {
      available: "UNKNOWN",
      observedAt: null,
      source: "none",
      locked: null,
      userPresent: null,
      reason: "No session source",
    },
    cursor: emptyCursorContext(now),
    audio: emptyAudioContext(now),
    permissions: {
      accessibility: "UNKNOWN",
      screenRecording: "UNKNOWN",
      microphone: "UNKNOWN",
      observedAt: now,
      source: "capability-report",
    },
    freshness: { observedAt: now, ageMs: 0, status: "FRESH" },
  };
}

export function unionBounds(displays: EnvDisplay[]): EnvBounds | null {
  const withBounds = displays.filter((d) => d.bounds != null);
  if (withBounds.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of withBounds) {
    const b = d.bounds!;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
