/**
 * Phase 12 — Sophie ↔ JARVIS integration contract types.
 * Signals only. No commands, goals, animations, or executor hooks.
 */

/** Keys never accepted on any Sophie payload. */
export const FORBIDDEN_SOPHIE_PAYLOAD_KEYS = [
  "command",
  "shell",
  "exec",
  "script",
  "actionExecutor",
  "ActionExecutor",
  "goal",
  "animation",
  "animationOverride",
  "stateOverride",
  "requestState",
  "performAction",
  "runCommand",
  "execute",
] as const;

export type SophieInputEventType =
  | "user_returned"
  | "user_idle"
  | "user_became_busy"
  | "user_became_focused"
  | "pet"
  | "poke"
  | "wave"
  | "love"
  | "app_opened"
  | "app_closed"
  | "media_started"
  | "media_stopped"
  | "music_started"
  | "music_stopped"
  | "external_activity";

export type SophieOutputEventType =
  | "behavior_started"
  | "behavior_finished"
  | "user_interaction"
  | "state_changed";

export const SOPHIE_INPUT_EVENT_TYPES: readonly SophieInputEventType[] = [
  "user_returned",
  "user_idle",
  "user_became_busy",
  "user_became_focused",
  "pet",
  "poke",
  "wave",
  "love",
  "app_opened",
  "app_closed",
  "media_started",
  "media_stopped",
  "music_started",
  "music_stopped",
  "external_activity",
] as const;

export const SOPHIE_OUTPUT_EVENT_TYPES: readonly SophieOutputEventType[] = [
  "behavior_started",
  "behavior_finished",
  "user_interaction",
  "state_changed",
] as const;

export interface SophieEventBase {
  type: string;
  timestamp?: number;
  payload?: Record<string, unknown>;
}

export interface UserReturnedEvent {
  type: "user_returned";
  timestamp?: number;
  payload?: Record<string, never>;
}
export interface UserIdleEvent {
  type: "user_idle";
  timestamp?: number;
  payload?: Record<string, never>;
}
export interface UserBecameBusyEvent {
  type: "user_became_busy";
  timestamp?: number;
  payload?: Record<string, never>;
}
export interface UserBecameFocusedEvent {
  type: "user_became_focused";
  timestamp?: number;
  payload?: Record<string, never>;
}
export interface PetEvent {
  type: "pet";
  timestamp?: number;
  payload?: Record<string, never>;
}
export interface PokeEvent {
  type: "poke";
  timestamp?: number;
  payload?: Record<string, never>;
}
export interface WaveEvent {
  type: "wave";
  timestamp?: number;
  payload?: Record<string, never>;
}
export interface LoveEvent {
  type: "love";
  timestamp?: number;
  payload?: Record<string, never>;
}
export interface AppOpenedEvent {
  type: "app_opened";
  timestamp?: number;
  payload?: { appId?: string; name?: string };
}
export interface AppClosedEvent {
  type: "app_closed";
  timestamp?: number;
  payload?: { appId?: string; name?: string };
}
export interface MediaStartedEvent {
  type: "media_started";
  timestamp?: number;
  payload?: { kind?: string };
}
export interface MediaStoppedEvent {
  type: "media_stopped";
  timestamp?: number;
  payload?: { kind?: string };
}
export interface MusicStartedEvent {
  type: "music_started";
  timestamp?: number;
  payload?: { title?: string };
}
export interface MusicStoppedEvent {
  type: "music_stopped";
  timestamp?: number;
  payload?: Record<string, never>;
}
export interface ExternalActivityEvent {
  type: "external_activity";
  timestamp?: number;
  payload?: { source?: string };
}

export type SophieInputEvent =
  | UserReturnedEvent
  | UserIdleEvent
  | UserBecameBusyEvent
  | UserBecameFocusedEvent
  | PetEvent
  | PokeEvent
  | WaveEvent
  | LoveEvent
  | AppOpenedEvent
  | AppClosedEvent
  | MediaStartedEvent
  | MediaStoppedEvent
  | MusicStartedEvent
  | MusicStoppedEvent
  | ExternalActivityEvent;

export interface BehaviorStartedEvent {
  type: "behavior_started";
  timestamp: number;
  behaviorId: string;
}
export interface BehaviorFinishedEvent {
  type: "behavior_finished";
  timestamp: number;
  behaviorId: string;
}
export interface UserInteractionEvent {
  type: "user_interaction";
  timestamp: number;
  interactionType: SophieInputEventType;
}
export interface StateChangedEvent {
  type: "state_changed";
  timestamp: number;
  state: string;
  previousState?: string;
}

export type SophieOutputEvent =
  | BehaviorStartedEvent
  | BehaviorFinishedEvent
  | UserInteractionEvent
  | StateChangedEvent;

export type SophieEvent = SophieInputEvent | SophieOutputEvent;

export interface SophieSignalRecord {
  type: string;
  timestamp: number;
}

/** Ephemeral Sophie signals merged into ContextSnapshot (bounded). */
export interface ContextSophieSignals {
  lastSophieInteraction: SophieSignalRecord | null;
  lastMediaEvent: SophieSignalRecord | null;
  lastUserSignal: SophieSignalRecord | null;
}

export interface SophiePublicSnapshot {
  state: string;
  activity: string | null;
  userPresence: string | null;
  environment: {
    media: string | null;
    lastAppHint: string | null;
  };
  personality: {
    lastInteraction: string | null;
  };
}

export interface SophieIntegrationTiming {
  eventDispatchMs: number;
  integrationMs: number;
  snapshotMs: number;
}

export interface SophieEmitSuccess {
  ok: true;
  event: SophieInputEvent;
  timing: SophieIntegrationTiming;
}

export interface SophieEmitFailure {
  ok: false;
  code: string;
  message: string;
  timing: SophieIntegrationTiming;
}

export type SophieEmitResult = SophieEmitSuccess | SophieEmitFailure;

export const SOPHIE_ERROR_CODES = {
  INVALID_EVENT: "INVALID_EVENT",
  FORBIDDEN_PAYLOAD: "FORBIDDEN_PAYLOAD",
  UNKNOWN_TYPE: "UNKNOWN_TYPE",
  MALFORMED: "MALFORMED",
} as const;

export type SophieEventListener<T extends SophieEvent = SophieEvent> = (
  event: T,
) => void | Promise<void>;
