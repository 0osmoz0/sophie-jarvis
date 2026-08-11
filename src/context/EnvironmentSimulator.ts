/**
 * Phase 24 — Environment SIMULATION helpers (MODE: SIMULATION).
 * No ActionExecutor / FileService / ApplicationService imports.
 */

import {
  classifyActivityLevel,
  computeFreshness,
  emptyEnvironment,
  unionBounds,
  type EnvironmentChange,
  type EnvironmentContext,
  type EnvDisplay,
} from "./EnvironmentContext.js";
import { EnvironmentChangeTracker } from "./EnvironmentChangeTracker.js";
import { emptyCursorContext } from "./CursorContext.js";
import { emptyAudioContext } from "./AudioContext.js";
import { emptyFocusedWindowContext } from "./FocusedWindowContext.js";

export type EnvironmentSimScenario =
  | "single_display"
  | "multi_display"
  | "app_change"
  | "window_change"
  | "active_user"
  | "idle_user"
  | "locked_session"
  | "unknown_session"
  | "cursor_unavailable"
  | "audio_unavailable"
  | "permission_denied"
  | "stale_context"
  | "rapid_change"
  | "external_monitor_toggle";

export interface EnvironmentSimReport {
  mode: "SIMULATION";
  total: number;
  distribution: Record<string, number>;
  changeTypes: Record<string, number>;
  staleCount: number;
  unknownSessionCount: number;
  cursorUnavailableCount: number;
  audioUnavailableCount: number;
}

export function buildEnvironmentScenarios(n: number): EnvironmentSimScenario[] {
  const cycle: EnvironmentSimScenario[] = [
    "single_display",
    "multi_display",
    "app_change",
    "window_change",
    "active_user",
    "idle_user",
    "locked_session",
    "unknown_session",
    "cursor_unavailable",
    "audio_unavailable",
    "permission_denied",
    "stale_context",
    "rapid_change",
    "external_monitor_toggle",
  ];
  const out: EnvironmentSimScenario[] = [];
  for (let i = 0; i < n; i++) out.push(cycle[i % cycle.length]!);
  return out;
}

export function simulateEnvironment(
  scenario: EnvironmentSimScenario,
  now: number,
  seq: number,
): EnvironmentContext {
  const env = emptyEnvironment(now);
  const display0: EnvDisplay = {
    id: "display-0",
    width: 1512,
    height: 982,
    scaleFactor: 2,
    isPrimary: true,
    bounds: { x: 0, y: 0, width: 1512, height: 982 },
  };
  const display1: EnvDisplay = {
    id: "display-1",
    width: 2560,
    height: 1440,
    scaleFactor: 1,
    isPrimary: false,
    bounds: { x: 1512, y: 0, width: 2560, height: 1440 },
  };

  env.focusedWindow = emptyFocusedWindowContext();
  env.cursor = {
    ...emptyCursorContext(now),
    available: "UNAVAILABLE",
    reason: "SIMULATION — cursor unavailable",
  };
  env.audio = {
    ...emptyAudioContext(now),
    available: "UNAVAILABLE",
    reason: "SIMULATION — audio unavailable",
  };

  switch (scenario) {
    case "single_display":
      setDisplays(env, [display0], now);
      setApp(env, "Safari", 3, now);
      setWindow(env, "Safari", "Home", now);
      setActivity(env, 5, now);
      setSession(env, false, null, now);
      break;
    case "multi_display":
      setDisplays(env, [display0, display1], now);
      setApp(env, "Code", 5, now);
      setWindow(env, "Code", "main.ts", now);
      setActivity(env, 10, now);
      setSession(env, false, null, now);
      break;
    case "app_change":
      setDisplays(env, [display0], now);
      setApp(env, seq % 2 === 0 ? "Safari" : "Chrome", 4, now);
      setWindow(env, seq % 2 === 0 ? "Safari" : "Chrome", "tab", now);
      setActivity(env, 2, now);
      setSession(env, false, null, now);
      break;
    case "window_change":
      setDisplays(env, [display0], now);
      setApp(env, "Safari", 2, now);
      setWindow(env, "Safari", `Page ${seq}`, now);
      setActivity(env, 3, now);
      setSession(env, false, null, now);
      break;
    case "active_user":
      setDisplays(env, [display0], now);
      setApp(env, "Terminal", 2, now);
      setWindow(env, "Terminal", "zsh", now);
      setActivity(env, 1, now);
      setSession(env, false, null, now);
      break;
    case "idle_user":
      setDisplays(env, [display0], now);
      setApp(env, "Safari", 2, now);
      setWindow(env, "Safari", "Idle", now);
      setActivity(env, 600, now);
      setSession(env, false, null, now);
      break;
    case "locked_session":
      setDisplays(env, [display0], now);
      setApp(env, null, 0, now);
      setWindow(env, null, null, now);
      setActivity(env, 120, now);
      setSession(env, true, null, now);
      break;
    case "unknown_session":
      setDisplays(env, [display0], now);
      setApp(env, "Finder", 1, now);
      setWindow(env, "Finder", null, now);
      setActivity(env, 20, now);
      env.session = {
        available: "UNKNOWN",
        observedAt: now,
        source: "sim",
        locked: null,
        userPresent: null,
        reason: "SIMULATION — unknown session (not false)",
      };
      break;
    case "cursor_unavailable":
      setDisplays(env, [display0], now);
      setApp(env, "Safari", 2, now);
      setWindow(env, "Safari", "x", now);
      setActivity(env, 4, now);
      setSession(env, false, null, now);
      break;
    case "audio_unavailable":
      setDisplays(env, [display0], now);
      setApp(env, "Spotify", 3, now);
      setWindow(env, "Spotify", "Library", now);
      setActivity(env, 8, now);
      setSession(env, false, null, now);
      // Explicitly do NOT set playing=true
      break;
    case "permission_denied":
      env.screen = {
        ...env.screen,
        available: "PERMISSION_REQUIRED",
        observedAt: now,
        source: "sim",
        reason: "SIMULATION — Screen Recording required",
      };
      env.window = {
        ...env.window,
        available: "PERMISSION_REQUIRED",
        observedAt: now,
        source: "sim",
        reason: "SIMULATION — permission",
      };
      env.permissions = {
        accessibility: "REQUIRED",
        screenRecording: "REQUIRED",
        microphone: "UNKNOWN",
        observedAt: now,
        source: "sim",
      };
      setActivity(env, 15, now);
      setSession(env, null, null, now);
      break;
    case "stale_context": {
      const old = now - 60_000;
      setDisplays(env, [display0], old);
      setApp(env, "Safari", 2, old);
      setWindow(env, "Safari", "old", old);
      setActivity(env, 40, old);
      setSession(env, false, null, old);
      env.timestamp = now;
      env.freshness = computeFreshness(old, now);
      break;
    }
    case "rapid_change":
      setDisplays(env, [display0], now);
      setApp(env, `App${seq % 7}`, 5, now);
      setWindow(env, `App${seq % 7}`, `W${seq}`, now);
      setActivity(env, seq % 50, now);
      setSession(env, false, null, now);
      break;
    case "external_monitor_toggle":
      setDisplays(
        env,
        seq % 2 === 0 ? [display0] : [display0, display1],
        now,
      );
      setApp(env, "Safari", 2, now);
      setWindow(env, "Safari", "web", now);
      setActivity(env, 6, now);
      setSession(env, false, null, now);
      break;
  }

  if (scenario !== "stale_context") {
    env.freshness = computeFreshness(now, now);
  }
  return env;
}

export function runEnvironmentSimulation(n: number): {
  report: EnvironmentSimReport;
  changes: EnvironmentChange[];
} {
  const scenarios = buildEnvironmentScenarios(n);
  const tracker = new EnvironmentChangeTracker();
  const distribution: Record<string, number> = {};
  const changeTypes: Record<string, number> = {};
  let staleCount = 0;
  let unknownSessionCount = 0;
  let cursorUnavailableCount = 0;
  let audioUnavailableCount = 0;
  const allChanges: EnvironmentChange[] = [];
  let now = Date.now();

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]!;
    distribution[scenario] = (distribution[scenario] ?? 0) + 1;
    now += 16;
    const env = simulateEnvironment(scenario, now, i);
    const changes = tracker.observe(env);
    for (const c of changes) {
      allChanges.push(c);
      changeTypes[c.type] = (changeTypes[c.type] ?? 0) + 1;
    }
    if (env.freshness.status === "STALE") staleCount += 1;
    if (env.session.available === "UNKNOWN" || env.session.locked == null) {
      if (env.session.available === "UNKNOWN") unknownSessionCount += 1;
    }
    if (env.cursor.available === "UNAVAILABLE") cursorUnavailableCount += 1;
    if (env.audio.available === "UNAVAILABLE") audioUnavailableCount += 1;
  }

  return {
    report: {
      mode: "SIMULATION",
      total: n,
      distribution,
      changeTypes,
      staleCount,
      unknownSessionCount,
      cursorUnavailableCount,
      audioUnavailableCount,
    },
    changes: allChanges,
  };
}

function setDisplays(
  env: EnvironmentContext,
  displays: EnvDisplay[],
  observedAt: number,
): void {
  const primary = displays.find((d) => d.isPrimary) ?? displays[0] ?? null;
  env.screen = {
    available: "AVAILABLE",
    observedAt,
    source: "sim",
    displays,
    primaryDisplay: primary,
    width: primary?.width ?? null,
    height: primary?.height ?? null,
    scaleFactor: primary?.scaleFactor ?? null,
    displayCount: displays.length,
    globalBounds: unionBounds(displays),
    reason: null,
  };
}

function setApp(
  env: EnvironmentContext,
  name: string | null,
  runningCount: number,
  observedAt: number,
): void {
  env.application = {
    available: "AVAILABLE",
    observedAt,
    source: "sim",
    active: name
      ? { id: name.toLowerCase(), name, bundleId: null }
      : null,
    runningCount,
    recentApplications: name
      ? [{ id: name.toLowerCase(), name, bundleId: null }]
      : [],
    reason: null,
  };
}

function setWindow(
  env: EnvironmentContext,
  app: string | null,
  title: string | null,
  observedAt: number,
): void {
  env.window = {
    available: "AVAILABLE",
    observedAt,
    source: "sim",
    active: app
      ? {
          id: "w1",
          title,
          applicationName: app,
          bundleId: null,
          bounds: { x: 10, y: 10, width: 800, height: 600 },
        }
      : null,
    titleAvailable: !!title,
    boundsAvailable: !!app,
    reason: null,
  };
}

function setActivity(
  env: EnvironmentContext,
  idleSeconds: number,
  observedAt: number,
): void {
  env.userActivity = {
    available: "AVAILABLE",
    observedAt,
    source: "sim",
    idleSeconds,
    activityLevel: classifyActivityLevel(idleSeconds),
    reason: "SIMULATION — IDLE ≠ ABSENT",
  };
}

function setSession(
  env: EnvironmentContext,
  locked: boolean | null,
  userPresent: boolean | null,
  observedAt: number,
): void {
  const hasAny = locked != null || userPresent != null;
  env.session = {
    available: hasAny ? "AVAILABLE" : "UNKNOWN",
    observedAt,
    source: "sim",
    locked,
    userPresent,
    reason: hasAny ? null : "UNKNOWN (not false)",
  };
}
