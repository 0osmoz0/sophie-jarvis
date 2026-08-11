/**
 * SophieIntegration — validates Sophie signals and updates ephemeral context/memory.
 * Never calls ActionExecutor, FileService, ApplicationService, or PermissionManager.
 */
import { SophieEventBus } from "./SophieEventBus.js";
import type {
  ContextSophieSignals,
  SophieEmitResult,
  SophieInputEvent,
  SophieInputEventType,
  SophieIntegrationTiming,
  SophieOutputEvent,
  SophiePublicSnapshot,
  SophieSignalRecord,
} from "./types.js";
import {
  FORBIDDEN_SOPHIE_PAYLOAD_KEYS,
  SOPHIE_ERROR_CODES,
  SOPHIE_INPUT_EVENT_TYPES,
} from "./types.js";

const INTERACTION_TYPES = new Set<SophieInputEventType>([
  "pet",
  "poke",
  "wave",
  "love",
]);

const USER_SIGNAL_TYPES = new Set<SophieInputEventType>([
  "user_returned",
  "user_idle",
  "user_became_busy",
  "user_became_focused",
]);

const MEDIA_TYPES = new Set<SophieInputEventType>([
  "media_started",
  "media_stopped",
  "music_started",
  "music_stopped",
]);

export interface SophieIntegrationOptions {
  bus?: SophieEventBus;
  /** High-level runtime state provider (read-only string). */
  getRuntimeState?: () => string;
  now?: () => number;
}

/**
 * Bounded ephemeral signal memory — last signal per category only.
 */
export class SophieSignalMemory {
  lastSophieInteraction: SophieSignalRecord | null = null;
  lastMediaEvent: SophieSignalRecord | null = null;
  lastUserSignal: SophieSignalRecord | null = null;
  lastAppHint: string | null = null;
  lastMediaKind: string | null = null;

  toContextSignals(): ContextSophieSignals {
    return {
      lastSophieInteraction: this.lastSophieInteraction
        ? { ...this.lastSophieInteraction }
        : null,
      lastMediaEvent: this.lastMediaEvent
        ? { ...this.lastMediaEvent }
        : null,
      lastUserSignal: this.lastUserSignal
        ? { ...this.lastUserSignal }
        : null,
    };
  }

  clear(): void {
    this.lastSophieInteraction = null;
    this.lastMediaEvent = null;
    this.lastUserSignal = null;
    this.lastAppHint = null;
    this.lastMediaKind = null;
  }
}

export class SophieIntegration {
  readonly bus: SophieEventBus;
  readonly memory: SophieSignalMemory;
  private readonly getRuntimeState: () => string;
  private readonly now: () => number;
  private lastTiming: SophieIntegrationTiming = {
    eventDispatchMs: 0,
    integrationMs: 0,
    snapshotMs: 0,
  };

  constructor(options: SophieIntegrationOptions = {}) {
    this.bus = options.bus ?? new SophieEventBus();
    this.memory = new SophieSignalMemory();
    this.getRuntimeState = options.getRuntimeState ?? (() => "IDLE");
    this.now = options.now ?? (() => Date.now());
  }

  getLastTiming(): SophieIntegrationTiming {
    return { ...this.lastTiming };
  }

  getContextSignals(): ContextSophieSignals {
    return this.memory.toContextSignals();
  }

  /**
   * Accept a raw Sophie signal. Validates strictly. Never executes actions.
   */
  handleInput(raw: unknown): SophieEmitResult {
    const totalStart = this.now();
    const emptyTiming = (): SophieIntegrationTiming => ({
      eventDispatchMs: 0,
      integrationMs: this.now() - totalStart,
      snapshotMs: 0,
    });

    const validated = validateSophieInput(raw);
    if (!validated.ok) {
      this.lastTiming = emptyTiming();
      return {
        ok: false,
        code: validated.code,
        message: validated.message,
        timing: this.lastTiming,
      };
    }

    const event = validated.event;
    const ts = event.timestamp ?? this.now();
    const record: SophieSignalRecord = { type: event.type, timestamp: ts };

    if (INTERACTION_TYPES.has(event.type)) {
      this.memory.lastSophieInteraction = record;
    }
    if (USER_SIGNAL_TYPES.has(event.type)) {
      this.memory.lastUserSignal = record;
    }
    if (MEDIA_TYPES.has(event.type)) {
      this.memory.lastMediaEvent = record;
      if (event.type === "music_started" || event.type === "media_started") {
        this.memory.lastMediaKind = event.type;
      } else if (
        event.type === "music_stopped" ||
        event.type === "media_stopped"
      ) {
        this.memory.lastMediaKind = null;
      }
    }
    if (event.type === "app_opened") {
      const name =
        typeof event.payload?.name === "string"
          ? event.payload.name
          : typeof event.payload?.appId === "string"
            ? event.payload.appId
            : event.type;
      this.memory.lastAppHint = name;
      this.memory.lastSophieInteraction = record;
    }
    if (event.type === "app_closed") {
      this.memory.lastAppHint = null;
      this.memory.lastSophieInteraction = record;
    }
    if (event.type === "external_activity") {
      this.memory.lastUserSignal = record;
    }

    const dispatchStart = this.now();
    this.bus.emit(event);
    // High-level outbound for interactions — Sophie chooses animation itself.
    if (INTERACTION_TYPES.has(event.type)) {
      const outbound: SophieOutputEvent = {
        type: "user_interaction",
        timestamp: ts,
        interactionType: event.type,
      };
      this.bus.emit(outbound);
    }
    const eventDispatchMs = this.now() - dispatchStart;

    this.lastTiming = {
      eventDispatchMs,
      integrationMs: this.now() - totalStart,
      snapshotMs: 0,
    };

    return { ok: true, event, timing: this.lastTiming };
  }

  /** JARVIS-side outbound — never callable as system control from Sophie. */
  notifyBehaviorStarted(behaviorId: string): void {
    const id = sanitizeId(behaviorId);
    if (!id) return;
    this.bus.emit({
      type: "behavior_started",
      timestamp: this.now(),
      behaviorId: id,
    });
  }

  notifyBehaviorFinished(behaviorId: string): void {
    const id = sanitizeId(behaviorId);
    if (!id) return;
    this.bus.emit({
      type: "behavior_finished",
      timestamp: this.now(),
      behaviorId: id,
    });
  }

  notifyStateChanged(state: string, previousState?: string): void {
    const s = sanitizeId(state);
    if (!s) return;
    this.bus.emit({
      type: "state_changed",
      timestamp: this.now(),
      state: s,
      previousState: previousState
        ? sanitizeId(previousState) ?? undefined
        : undefined,
    });
  }

  /**
   * Outbound security alert metadata for Sophie UI only.
   * Never includes commands, shell, animation overrides, or executor hooks.
   */
  notifySecurityAlert(alert: {
    level: string;
    confidence: number;
    category: string;
    summary: string;
  }): void {
    const level = sanitizeId(alert.level) ?? "INFO";
    const category = sanitizeId(alert.category) ?? "CORRELATED";
    const summary = String(alert.summary ?? "")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 240);
    this.bus.emit({
      type: "security_alert",
      timestamp: this.now(),
      level,
      confidence: Math.max(0, Math.min(1, Number(alert.confidence) || 0)),
      category,
      summary,
    });
  }

  getSnapshot(): SophiePublicSnapshot {
    const snapStart = this.now();
    const activity = this.memory.lastUserSignal?.type ?? null;
    const presence =
      this.memory.lastUserSignal?.type === "user_idle"
        ? "idle"
        : this.memory.lastUserSignal?.type === "user_returned"
          ? "present"
          : this.memory.lastUserSignal
            ? "unknown"
            : null;

    const snapshot: SophiePublicSnapshot = {
      state: this.getRuntimeState(),
      activity,
      userPresence: presence,
      environment: {
        media: this.memory.lastMediaKind,
        lastAppHint: this.memory.lastAppHint,
      },
      personality: {
        lastInteraction: this.memory.lastSophieInteraction?.type ?? null,
      },
    };
    this.lastTiming = {
      ...this.lastTiming,
      snapshotMs: this.now() - snapStart,
    };
    return snapshot;
  }
}

function sanitizeId(value: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 64);
  if (!trimmed || /[^\w.\-:]/.test(trimmed)) return null;
  return trimmed;
}

function validateSophieInput(
  raw: unknown,
):
  | { ok: true; event: SophieInputEvent }
  | { ok: false; code: string; message: string } {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      code: SOPHIE_ERROR_CODES.MALFORMED,
      message: "Event must be a plain object",
    };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== "string") {
    return {
      ok: false,
      code: SOPHIE_ERROR_CODES.MALFORMED,
      message: "Event.type must be a string",
    };
  }

  // Reject disguised control verbs as types
  const typeLower = obj.type.toLowerCase();
  if (
    typeLower.includes("execute") ||
    typeLower.includes("shell") ||
    typeLower.includes("command") ||
    typeLower === "stateoverride" ||
    typeLower === "animationoverride"
  ) {
    return {
      ok: false,
      code: SOPHIE_ERROR_CODES.FORBIDDEN_PAYLOAD,
      message: `Forbidden event type: ${obj.type}`,
    };
  }

  if (
    !(SOPHIE_INPUT_EVENT_TYPES as readonly string[]).includes(obj.type)
  ) {
    return {
      ok: false,
      code: SOPHIE_ERROR_CODES.UNKNOWN_TYPE,
      message: `Unknown Sophie input type: ${obj.type}`,
    };
  }

  const payload =
    obj.payload === undefined
      ? {}
      : obj.payload && typeof obj.payload === "object" && !Array.isArray(obj.payload)
        ? (obj.payload as Record<string, unknown>)
        : null;

  if (payload === null) {
    return {
      ok: false,
      code: SOPHIE_ERROR_CODES.MALFORMED,
      message: "payload must be an object when provided",
    };
  }

  for (const key of Object.keys(payload)) {
    if (isForbiddenKey(key)) {
      return {
        ok: false,
        code: SOPHIE_ERROR_CODES.FORBIDDEN_PAYLOAD,
        message: `Forbidden payload key: ${key}`,
      };
    }
  }

  // Also reject forbidden keys at top level
  for (const key of Object.keys(obj)) {
    if (key === "type" || key === "timestamp" || key === "payload") continue;
    if (isForbiddenKey(key)) {
      return {
        ok: false,
        code: SOPHIE_ERROR_CODES.FORBIDDEN_PAYLOAD,
        message: `Forbidden top-level key: ${key}`,
      };
    }
    return {
      ok: false,
      code: SOPHIE_ERROR_CODES.INVALID_EVENT,
      message: `Unexpected top-level key: ${key}`,
    };
  }

  if (
    obj.timestamp !== undefined &&
    (typeof obj.timestamp !== "number" || !Number.isFinite(obj.timestamp))
  ) {
    return {
      ok: false,
      code: SOPHIE_ERROR_CODES.MALFORMED,
      message: "timestamp must be a finite number",
    };
  }

  // Reject string values that look like shell
  for (const value of Object.values(payload)) {
    if (typeof value === "string" && looksLikeShell(value)) {
      return {
        ok: false,
        code: SOPHIE_ERROR_CODES.FORBIDDEN_PAYLOAD,
        message: "Payload value looks like a shell command",
      };
    }
  }

  return {
    ok: true,
    event: {
      type: obj.type as SophieInputEventType,
      timestamp:
        typeof obj.timestamp === "number" ? obj.timestamp : undefined,
      payload,
    } as SophieInputEvent,
  };
}

function isForbiddenKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (FORBIDDEN_SOPHIE_PAYLOAD_KEYS as readonly string[]).some(
    (k) => k.toLowerCase() === lower,
  );
}

function looksLikeShell(value: string): boolean {
  const lower = value.toLowerCase();
  if (
    lower.includes("rm -rf") ||
    lower.includes("sudo ") ||
    lower.includes("bash -c") ||
    lower.includes("curl ") ||
    lower.includes("wget ")
  ) {
    return true;
  }
  return /^(sh|bash|zsh|cmd)\b/i.test(value.trim());
}
