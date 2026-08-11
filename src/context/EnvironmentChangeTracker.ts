/**
 * Phase 24/25 — bounded EnvironmentChange history (observation only).
 */

import {
  ENVIRONMENT_LIMITS,
  type EnvironmentChange,
  type EnvironmentChangeType,
  type EnvironmentContext,
} from "./EnvironmentContext.js";

export class EnvironmentChangeTracker {
  private readonly history: EnvironmentChange[] = [];
  private previous: EnvironmentContext | null = null;
  private readonly maxEntries: number;

  constructor(maxEntries: number = ENVIRONMENT_LIMITS.maxChangeHistory) {
    this.maxEntries = maxEntries;
  }

  observe(current: EnvironmentContext): EnvironmentChange[] {
    const now = current.timestamp;
    const emitted: EnvironmentChange[] = [];
    const prev = this.previous;
    if (prev) {
      maybePush(emitted, "APPLICATION_CHANGED", appKey(prev), appKey(current), now);
      maybePush(
        emitted,
        "ACTIVE_APPLICATION_CHANGED",
        prev.application.active?.name ?? null,
        current.application.active?.name ?? null,
        now,
      );
      maybePush(emitted, "WINDOW_CHANGED", winKey(prev), winKey(current), now);
      maybePush(
        emitted,
        "FOCUSED_WINDOW_CHANGED",
        focusKey(prev),
        focusKey(current),
        now,
      );
      maybePush(emitted, "SCREEN_CHANGED", screenKey(prev), screenKey(current), now);
      maybePush(emitted, "SESSION_CHANGED", sessionKey(prev), sessionKey(current), now);
      maybePush(
        emitted,
        "USER_ACTIVITY_CHANGED",
        activityKey(prev),
        activityKey(current),
        now,
      );
      maybePush(emitted, "AUDIO_STATE_CHANGED", audioKey(prev), audioKey(current), now);
      maybePush(
        emitted,
        "AUDIO_PLAYBACK_STARTED",
        audioPlayback(prev),
        audioPlayback(current),
        now,
        (p, c) => p !== "playing" && c === "playing",
      );
      maybePush(
        emitted,
        "AUDIO_PLAYBACK_STOPPED",
        audioPlayback(prev),
        audioPlayback(current),
        now,
        (p, c) => p === "playing" && c !== "playing",
      );
      maybePush(
        emitted,
        "AUDIO_TRACK_CHANGED",
        audioTrackKey(prev),
        audioTrackKey(current),
        now,
      );
      maybePush(
        emitted,
        "CURSOR_MOVED",
        cursorPosKey(prev),
        cursorPosKey(current),
        now,
      );
      maybePush(
        emitted,
        "CURSOR_ENTERED_PROXIMITY",
        cursorProxKey(prev),
        cursorProxKey(current),
        now,
        (p, c) => p !== "near" && c === "near",
      );
      maybePush(
        emitted,
        "CURSOR_LEFT_PROXIMITY",
        cursorProxKey(prev),
        cursorProxKey(current),
        now,
        (p, c) => p === "near" && c !== "near",
      );
    }
    for (const c of emitted) {
      this.history.push(c);
      while (this.history.length > this.maxEntries) this.history.shift();
    }
    this.previous = cloneLite(current);
    return emitted;
  }

  list(): readonly EnvironmentChange[] {
    return [...this.history];
  }

  clear(): void {
    this.history.length = 0;
    this.previous = null;
  }
}

function maybePush(
  out: EnvironmentChange[],
  type: EnvironmentChangeType,
  previous: string | null,
  current: string | null,
  timestamp: number,
  when?: (prev: string | null, cur: string | null) => boolean,
): void {
  if (when) {
    if (!when(previous, current)) return;
  } else if (previous === current) {
    return;
  }
  out.push({ type, previous, current, timestamp });
}

function appKey(e: EnvironmentContext): string | null {
  if (e.application.available !== "AVAILABLE") {
    return `status:${e.application.available}`;
  }
  return `${e.application.active?.name ?? ""}|${e.application.runningCount ?? ""}`;
}

function winKey(e: EnvironmentContext): string | null {
  if (e.window.available !== "AVAILABLE") {
    return `status:${e.window.available}`;
  }
  const a = e.window.active;
  return `${a?.id ?? ""}|${a?.applicationName ?? ""}|${a?.title ?? ""}`;
}

function focusKey(e: EnvironmentContext): string | null {
  const f = e.focusedWindow;
  if (f.available !== "AVAILABLE") return `status:${f.available}`;
  const w = f.focused ?? f.heuristic;
  return `${w?.applicationName ?? ""}|${w?.title ?? ""}`;
}

function screenKey(e: EnvironmentContext): string | null {
  if (e.screen.available !== "AVAILABLE") {
    return `status:${e.screen.available}`;
  }
  return e.screen.displays
    .map((d) => `${d.id}:${d.width}x${d.height}@${d.scaleFactor ?? "?"}`)
    .join(";");
}

function sessionKey(e: EnvironmentContext): string | null {
  return `${e.session.available}|${e.session.locked}|${e.session.userPresent}`;
}

function activityKey(e: EnvironmentContext): string | null {
  return `${e.userActivity.activityLevel}|${e.userActivity.idleSeconds}`;
}

function audioKey(e: EnvironmentContext): string | null {
  return `${e.audio.available}|${e.audio.playing}|${e.audio.playbackState}|${e.audio.activeApplication}`;
}

function audioPlayback(e: EnvironmentContext): string | null {
  if (e.audio.playbackState) return e.audio.playbackState;
  if (e.audio.playing === true) return "playing";
  if (e.audio.playing === false) return "stopped";
  return "unknown";
}

function audioTrackKey(e: EnvironmentContext): string | null {
  return `${e.audio.trackChanged}|${e.audio.activeApplication}`;
}

function cursorPosKey(e: EnvironmentContext): string | null {
  if (e.cursor.available !== "AVAILABLE") return `status:${e.cursor.available}`;
  return `${e.cursor.x},${e.cursor.y}`;
}

function cursorProxKey(e: EnvironmentContext): string | null {
  if (e.cursor.nearby == null) return "unknown";
  return e.cursor.nearby ? "near" : "far";
}

function cloneLite(e: EnvironmentContext): EnvironmentContext {
  return JSON.parse(JSON.stringify(e)) as EnvironmentContext;
}
