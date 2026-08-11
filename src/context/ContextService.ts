import type { ObservationService } from "../observation/ObservationService.js";
import type { ApplicationService } from "../applications/ApplicationService.js";
import type { ScreenService } from "../screen/ScreenService.js";
import type { UserActivityService } from "../presence/UserActivityService.js";
import type {
  ContextApplicationsInfo,
  ContextAuditSink,
  ContextMemoryInfo,
  ContextQueryKind,
  ContextScreenInfo,
  ContextServiceResult,
  ContextSnapshot,
  ContextSophieSignals,
  ContextTiming,
  DomainStatus,
} from "./types.js";
import { MemoryContextAuditLog } from "./ContextAuditLog.js";
import {
  classifyActivityLevel,
  computeFreshness,
  emptyEnvironment,
  unionBounds,
  type EnvironmentSnapshotResult,
  type EnvironmentTiming,
  type EnvAvailability,
  type EnvDisplay,
  type PermissionReportState,
  ENVIRONMENT_LIMITS,
} from "./EnvironmentContext.js";
import { EnvironmentChangeTracker } from "./EnvironmentChangeTracker.js";
import {
  computeCursorMotion,
  CursorProximityPolicy,
  emptyCursorContext,
  mapMouseToDisplay,
} from "./CursorContext.js";
import { CursorMotionTracker } from "./CursorMotionTracker.js";
import {
  compareFocusWindows,
  emptyFocusedWindowContext,
} from "./FocusedWindowContext.js";
import { emptyAudioContext } from "./AudioContext.js";
import type { CursorReader, FocusReader } from "./EnvironmentObservation.js";
import { MacOSCursorReader, UnavailableCursorReader } from "../platform/macos/MacOSCursorReader.js";
import { MacOSFocusReader, UnavailableFocusReader } from "../platform/macos/MacOSFocusReader.js";
import type { SophieEnvironmentConsumer } from "./SophieEnvironmentConsumer.js";
import type { SophieEnvironmentSnapshot } from "./SophieEnvironmentConsumer.js";

export interface ContextServiceOptions {
  observation?: ObservationService;
  applications?: ApplicationService;
  screen?: ScreenService;
  activity?: UserActivityService;
  audit?: ContextAuditSink;
  sophieSignals?: () => ContextSophieSignals | undefined;
  memoryRelevant?: () => ContextMemoryInfo | Promise<ContextMemoryInfo>;
  environmentChanges?: EnvironmentChangeTracker;
  cursorReader?: CursorReader;
  focusReader?: FocusReader;
  cursorPolicy?: CursorProximityPolicy;
  cursorMotion?: CursorMotionTracker;
  /** Phase 26 — optional Sophie environment consumer (observation only). */
  sophieEnvironmentConsumer?: SophieEnvironmentConsumer;
}

/**
 * ContextService — read-only façade over existing observation services.
 * Never invents values. Never triggers actions. No permanent polling.
 */
export class ContextService {
  private readonly observation: ObservationService | undefined;
  private readonly applications: ApplicationService | undefined;
  private readonly screen: ScreenService | undefined;
  private readonly activity: UserActivityService | undefined;
  private readonly audit: ContextAuditSink;
  private readonly sophieSignals: (() => ContextSophieSignals | undefined) | undefined;
  private readonly memoryRelevant:
    | (() => ContextMemoryInfo | Promise<ContextMemoryInfo>)
    | undefined;
  private readonly environmentChanges: EnvironmentChangeTracker;
  private readonly cursorReader: CursorReader;
  private readonly focusReader: FocusReader;
  private readonly cursorPolicy: CursorProximityPolicy;
  private readonly cursorMotion: CursorMotionTracker;
  private readonly sophieEnvironmentConsumer: SophieEnvironmentConsumer | undefined;

  constructor(options: ContextServiceOptions = {}) {
    this.observation = options.observation;
    this.applications = options.applications;
    this.screen = options.screen;
    this.activity = options.activity;
    this.audit = options.audit ?? new MemoryContextAuditLog();
    this.sophieSignals = options.sophieSignals;
    this.memoryRelevant = options.memoryRelevant;
    this.environmentChanges =
      options.environmentChanges ?? new EnvironmentChangeTracker();
    this.cursorReader =
      options.cursorReader ??
      (process.platform === "darwin"
        ? new MacOSCursorReader()
        : new UnavailableCursorReader("Not darwin"));
    this.focusReader =
      options.focusReader ??
      (process.platform === "darwin"
        ? new MacOSFocusReader()
        : new UnavailableFocusReader());
    this.sophieEnvironmentConsumer = options.sophieEnvironmentConsumer;
    this.cursorPolicy =
      options.cursorPolicy ??
      options.sophieEnvironmentConsumer?.toCursorProximityPolicy() ??
      new CursorProximityPolicy();
    this.cursorMotion = options.cursorMotion ?? new CursorMotionTracker();
  }

  /**
   * Phase 26 — unique API for Sophie environmental consumption.
   * Requires sophieEnvironmentConsumer in options (or creates default unavailable-anchor consumer).
   */
  async getSophieEnvironmentSnapshot(): Promise<SophieEnvironmentSnapshot> {
    const { SophieEnvironmentConsumer: Consumer } = await import(
      "./SophieEnvironmentConsumer.js"
    );
    const consumer =
      this.sophieEnvironmentConsumer ?? new Consumer();
    return consumer.getSophieEnvironmentSnapshot(this);
  }

  getEnvironmentChangeHistory() {
    return this.environmentChanges.list();
  }

  /**
   * Phase 24 — coherent EnvironmentContext snapshot (on-demand).
   * Observation + normalize + expose only. Never decides / acts.
   */
  async getEnvironmentSnapshot(): Promise<EnvironmentSnapshotResult> {
    const totalStart = Date.now();
    const now = totalStart;
    const timing: EnvironmentTiming = {
      screenMs: null,
      applicationMs: null,
      windowMs: null,
      activityMs: null,
      sessionMs: null,
      cursorMs: null,
      focusMs: null,
      axMs: null,
      audioMs: null,
      aggregationMs: null,
      totalContextMs: 0,
    };

    const env = emptyEnvironment(now);
    const aggStart = Date.now();

    // --- Screen + window + session (same ScreenService, timed separately) ---
    if (this.screen) {
      const tScreen = Date.now();
      const info = await this.screen.info();
      timing.screenMs = Date.now() - tScreen;
      if (info.success) {
        const displays: EnvDisplay[] = info.data.screens.map((s) => ({
          id: s.id,
          width: s.width ?? null,
          height: s.height ?? null,
          scaleFactor: s.scaleFactor ?? null,
          isPrimary: s.isPrimary ?? null,
          bounds: s.bounds
            ? {
                x: s.bounds.x,
                y: s.bounds.y,
                width: s.bounds.width,
                height: s.bounds.height,
              }
            : null,
        }));
        const primary =
          displays.find((d) => d.isPrimary === true) ?? displays[0] ?? null;
        env.screen = {
          available: "AVAILABLE",
          observedAt: now,
          source: this.screen.backend.name,
          displays,
          primaryDisplay: primary,
          width: primary?.width ?? null,
          height: primary?.height ?? null,
          scaleFactor: primary?.scaleFactor ?? null,
          displayCount: displays.length,
          globalBounds: unionBounds(displays),
          reason: null,
        };
      } else {
        env.screen = {
          ...env.screen,
          available: mapEnvAvail(info.error.code),
          observedAt: now,
          source: this.screen.backend.name,
          reason: info.error.message,
        };
      }

      const tWin = Date.now();
      const win = await this.screen.windows();
      const active = await this.screen.activeWindow();
      timing.windowMs = Date.now() - tWin;
      if (active.success) {
        const w = active.data.window;
        env.window = {
          available: "AVAILABLE",
          observedAt: now,
          source: this.screen.backend.name,
          active: w
            ? {
                id: w.id ?? null,
                title: w.title ?? null,
                applicationName:
                  w.applicationName ?? active.data.application ?? null,
                bundleId: w.bundleId ?? null,
                bounds: w.bounds
                  ? {
                      x: w.bounds.x,
                      y: w.bounds.y,
                      width: w.bounds.width,
                      height: w.bounds.height,
                    }
                  : null,
              }
            : null,
          titleAvailable: !!w?.title,
          boundsAvailable: !!w?.bounds,
          reason: win.success ? null : `windows list: ${win.error.code}`,
        };
      } else {
        env.window = {
          ...env.window,
          available: mapEnvAvail(active.error.code),
          observedAt: now,
          source: this.screen.backend.name,
          reason: active.error.message,
        };
      }

      const tSess = Date.now();
      const sess = await this.screen.session();
      timing.sessionMs = Date.now() - tSess;
      if (sess.success) {
        const locked = sess.data.locked;
        const userPresent = sess.data.userPresent;
        const hasAny = locked != null || userPresent != null;
        env.session = {
          available: hasAny ? "AVAILABLE" : "UNKNOWN",
          observedAt: now,
          source: this.screen.backend.name,
          locked,
          userPresent,
          reason: hasAny
            ? null
            : "Session keys absent — UNKNOWN (not coerced to false)",
        };
      } else {
        env.session = {
          available: mapEnvAvail(sess.error.code),
          observedAt: now,
          source: this.screen.backend.name,
          locked: null,
          userPresent: null,
          reason: sess.error.message,
        };
      }
    }

    // --- Applications ---
    if (this.applications) {
      const t0 = Date.now();
      const list = await this.applications.list();
      const active = await this.applications.active();
      timing.applicationMs = Date.now() - t0;
      if (list.success) {
        const running = list.data.applications.filter((a) => a.running === true);
        env.application = {
          available: "AVAILABLE",
          observedAt: now,
          source: this.applications.backend.name,
          active:
            active.success && active.data
              ? {
                  id: active.data.id ?? null,
                  name: active.data.name ?? null,
                  bundleId: active.data.bundleId ?? null,
                }
              : null,
          runningCount: running.length,
          recentApplications: running
            .slice(0, ENVIRONMENT_LIMITS.maxRecentApplications)
            .map((a) => ({
              id: a.id ?? null,
              name: a.name ?? null,
              bundleId: a.bundleId ?? null,
            })),
          reason:
            active.success
              ? null
              : `active: ${active.success === false ? active.error.code : "null"}`,
        };
      } else {
        env.application = {
          ...env.application,
          available: mapEnvAvail(list.error.code),
          observedAt: now,
          source: this.applications.backend.name,
          reason: list.error.message,
        };
      }
    }

    // --- User activity ---
    if (this.activity) {
      const t0 = Date.now();
      const act = await this.activity.getActivity();
      timing.activityMs = Date.now() - t0;
      if (act.success) {
        const idle = act.data.idleSeconds ?? null;
        const level = classifyActivityLevel(idle);
        const unknown =
          act.data.status === "UNKNOWN" || act.data.source === "unavailable";
        env.userActivity = {
          available: unknown ? "UNKNOWN" : "AVAILABLE",
          observedAt: now,
          source: "UserActivityService",
          idleSeconds: idle,
          activityLevel: unknown ? "UNKNOWN" : level,
          reason: unknown
            ? "Activity observation unavailable — IDLE ≠ ABSENT"
            : "IDLE ≠ ABSENT (software signal only)",
        };
      } else {
        env.userActivity = {
          available: "UNKNOWN",
          observedAt: now,
          source: "UserActivityService",
          idleSeconds: null,
          activityLevel: "UNKNOWN",
          reason: act.error.message,
        };
      }
    }

    // --- Focused window (AX) + heuristic compare ---
    const heuristicRef = env.window.active;
    const tFocus = Date.now();
    let axStatus: EnvAvailability = "UNAVAILABLE";
    let axWindow = null as ReturnType<MacOSFocusReader["readWithStatus"]>["window"];
    if (this.focusReader instanceof MacOSFocusReader) {
      const ax = this.focusReader.readWithStatus();
      timing.axMs = Date.now() - tFocus;
      axStatus = ax.status;
      axWindow = ax.window;
      env.focusedWindow = {
        available: ax.status === "AVAILABLE" ? "AVAILABLE" : ax.status,
        observedAt: now,
        source: ax.status === "AVAILABLE" ? "accessibility" : "none",
        accessibilityAvailable: ax.status === "AVAILABLE" ? true : ax.status === "PERMISSION_REQUIRED" ? false : null,
        focused: axWindow
          ? {
              id: axWindow.id,
              title: axWindow.title,
              applicationName: axWindow.applicationName,
              bundleId: axWindow.bundleId,
              bounds: axWindow.bounds,
            }
          : null,
        heuristic: heuristicRef,
        matchesHeuristic: compareFocusWindows(
          axWindow
            ? {
                id: axWindow.id,
                title: axWindow.title,
                applicationName: axWindow.applicationName,
                bundleId: axWindow.bundleId,
                bounds: axWindow.bounds,
              }
            : null,
          heuristicRef,
        ),
        titleAvailable: !!(axWindow?.title ?? heuristicRef?.title),
        boundsAvailable: !!(axWindow?.bounds ?? heuristicRef?.bounds),
        reason: ax.reason ?? null,
      };
    } else {
      const cap = this.focusReader.getCapability();
      env.focusedWindow = {
        ...emptyFocusedWindowContext(),
        available: cap.status,
        observedAt: now,
        source: this.focusReader.name.includes("mock") ? "accessibility" : "none",
        heuristic: heuristicRef,
        titleAvailable: !!heuristicRef?.title,
        boundsAvailable: !!heuristicRef?.bounds,
        reason: cap.reason ?? null,
      };
      const fw = this.focusReader.read();
      if (fw) {
        env.focusedWindow.available = "AVAILABLE";
        env.focusedWindow.focused = {
          id: fw.id,
          title: fw.title,
          applicationName: fw.applicationName,
          bundleId: fw.bundleId,
          bounds: fw.bounds,
        };
        env.focusedWindow.matchesHeuristic = compareFocusWindows(
          env.focusedWindow.focused,
          heuristicRef,
        );
      }
      timing.focusMs = Date.now() - tFocus;
    }

    // --- Cursor (on-demand read + motion from prior sample) ---
    const tCursor = Date.now();
    const cursorCap = this.cursorReader.getCapability();
    const read = this.cursorReader.read();
    timing.cursorMs = Date.now() - tCursor;
    if (cursorCap.status === "AVAILABLE" && read) {
      const sample = { x: read.x, y: read.y, observedAt: now };
      const prev = this.cursorMotion.record(sample);
      const motion = computeCursorMotion(sample, prev, this.cursorPolicy);
      this.cursorMotion.updateProximity(motion.nearby);
      const ageMs = 0;
      env.cursor = {
        available: "AVAILABLE",
        observedAt: now,
        source: this.cursorReader.name,
        coordinateSpace: read.coordinateSpace,
        x: read.x,
        y: read.y,
        displayId: mapMouseToDisplay(env.screen.displays, read.x, read.y),
        moving: motion.moving,
        velocity: motion.velocity,
        direction: motion.direction,
        distanceToSophie: motion.distanceToSophie,
        nearby: motion.nearby,
        approaching: motion.approaching,
        leaving: motion.leaving,
        ageMs,
        freshness: computeFreshness(now, now),
        reason: null,
      };
    } else {
      env.cursor = {
        ...emptyCursorContext(now),
        available: cursorCap.status,
        source: this.cursorReader.name,
        reason: cursorCap.reason ?? "Cursor read failed",
      };
    }

    // --- Audio: Now Playing remains UNAVAILABLE (Phase 25 audit) ---
    timing.audioMs = 0;
    env.audio = emptyAudioContext(now);

    // --- Permissions (report only — never request TCC) ---
    const axPerm =
      this.focusReader instanceof MacOSFocusReader
        ? mapPerm(
            env.focusedWindow.available === "PERMISSION_REQUIRED"
              ? "PERMISSION_REQUIRED"
              : env.focusedWindow.available === "AVAILABLE"
                ? "AVAILABLE"
                : "UNAVAILABLE",
          )
        : mapPerm(this.focusReader.getCapability().status);
    env.permissions = {
      accessibility: axPerm,
      screenRecording: mapPerm(
        this.screen
          ? this.screen.backend.getCapabilityStatus("windows").status
          : undefined,
      ),
      microphone: "UNKNOWN",
      observedAt: now,
      source: "capability-report",
    };

    env.freshness = computeFreshness(now, Date.now());
    timing.aggregationMs = Date.now() - aggStart;
    timing.totalContextMs = Date.now() - totalStart;

    const changes = this.environmentChanges.observe(env);

    this.audit.append({
      timestamp: new Date().toISOString(),
      toolId: "environment.snapshot",
      query: "system.context",
      systemStatus: "unavailable",
      applicationsStatus: mapDomain(env.application.available),
      screenStatus: mapDomain(env.screen.available),
      activityStatus: mapDomain(env.userActivity.available),
      presenceStatus: "unknown",
      filesStatus: "unavailable",
      result: "success",
      latencyMs: timing.totalContextMs,
    });

    return { environment: env, timing, changes };
  }


  async getSnapshot(
    query: ContextQueryKind = "system.context",
  ): Promise<ContextServiceResult> {
    const totalStart = Date.now();
    const timing: ContextTiming = {
      systemMs: 0,
      applicationMs: 0,
      screenMs: 0,
      activityMs: 0,
      totalMs: 0,
      contextSnapshotMs: 0,
    };

    const snapshot: ContextSnapshot = {
      timestamp: Date.now(),
      system: { status: "unavailable", reason: "No ObservationService" },
      applications: { status: "unavailable", reason: "No ApplicationService" },
      screen: { status: "unavailable", reason: "No ScreenService" },
      activity: { status: "unknown", reason: "No UserActivityService" },
      presence: { status: "unknown", reason: "No UserActivityService" },
      files: { status: "unavailable", reason: "No ObservationService" },
    };

    const needSystem =
      query === "system.context" || query === "system.status";
    const needApps =
      query === "system.context" || query === "application.status";
    const needScreen =
      query === "system.context" || query === "screen.status";
    const needUser =
      query === "system.context" || query === "user.status";

    if (needSystem || needApps || needScreen || needUser) {
      // Pull observation for system/files when system query is requested
      if (this.observation && needSystem) {
        const t0 = Date.now();
        try {
          const obs = await this.observation.snapshot({ bypassCache: true });
          timing.systemMs = Date.now() - t0;
          if (obs.system.availability === "available") {
            snapshot.system = {
              status: "available",
              os: obs.system.platform ?? undefined,
              architecture: obs.system.arch ?? undefined,
              hostname: obs.system.hostname,
              cpu: obs.system.cpu
                ? {
                    model: obs.system.cpu.model,
                    cores: obs.system.cpu.cores,
                    speedMHz: obs.system.cpu.speedMHz,
                  }
                : undefined,
              memory: obs.system.memory
                ? {
                    totalBytes: obs.system.memory.totalBytes,
                    freeBytes: obs.system.memory.freeBytes,
                  }
                : undefined,
              uptimeSeconds: obs.system.uptimeSeconds,
            };
          } else {
            snapshot.system = {
              status: mapObsAvailability(obs.system.availability),
              reason: obs.system.reason,
            };
          }

          snapshot.files = {
            status:
              obs.files.availability === "available"
                ? "available"
                : mapObsAvailability(obs.files.availability),
            configuredPaths: obs.files.configuredPaths ?? [],
            entryCount: Array.isArray(obs.files.entries)
              ? obs.files.entries.length
              : null,
            reason: obs.files.reason,
          };

          // Phase 2 application observer is often unavailable — prefer ApplicationService below.
          if (
            query === "system.context" &&
            !this.applications &&
            obs.applications
          ) {
            snapshot.applications = mapObsApplications(obs);
          }
        } catch (err) {
          timing.systemMs = Date.now() - t0;
          snapshot.system = {
            status: "error",
            reason: err instanceof Error ? err.message : String(err),
          };
        }
      } else if (needSystem && !this.observation) {
        snapshot.system = {
          status: "unavailable",
          reason: "ObservationService not configured",
        };
      }
    }

    if (needApps && this.applications) {
      const t0 = Date.now();
      snapshot.applications = await this.readApplications();
      timing.applicationMs = Date.now() - t0;
    }

    if (needScreen && this.screen) {
      const t0 = Date.now();
      snapshot.screen = await this.readScreen();
      timing.screenMs = Date.now() - t0;
    }

    if (needUser && this.activity) {
      const t0 = Date.now();
      await this.readActivity(snapshot);
      timing.activityMs = Date.now() - t0;
    }

    // Narrow domains for non-full queries: keep others as explicit unknown/unavailable defaults
    if (query === "system.status") {
      snapshot.applications = {
        status: "unavailable",
        reason: "Not requested",
      };
      snapshot.screen = { status: "unavailable", reason: "Not requested" };
      snapshot.activity = { status: "unknown", reason: "Not requested" };
      snapshot.presence = { status: "unknown", reason: "Not requested" };
    } else if (query === "application.status") {
      snapshot.screen = { status: "unavailable", reason: "Not requested" };
      snapshot.activity = { status: "unknown", reason: "Not requested" };
      snapshot.presence = { status: "unknown", reason: "Not requested" };
    } else if (query === "screen.status") {
      snapshot.applications = {
        status: "unavailable",
        reason: "Not requested",
      };
      snapshot.activity = { status: "unknown", reason: "Not requested" };
      snapshot.presence = { status: "unknown", reason: "Not requested" };
    } else if (query === "user.status") {
      snapshot.applications = {
        status: "unavailable",
        reason: "Not requested",
      };
      snapshot.screen = { status: "unavailable", reason: "Not requested" };
    }

    timing.totalMs = Date.now() - totalStart;
    timing.contextSnapshotMs = timing.totalMs;

    if (this.sophieSignals) {
      const signals = this.sophieSignals();
      if (signals) {
        snapshot.sophie = {
          lastSophieInteraction: signals.lastSophieInteraction
            ? { ...signals.lastSophieInteraction }
            : null,
          lastMediaEvent: signals.lastMediaEvent
            ? { ...signals.lastMediaEvent }
            : null,
          lastUserSignal: signals.lastUserSignal
            ? { ...signals.lastUserSignal }
            : null,
        };
      }
    }

    if (this.memoryRelevant && query === "system.context") {
      try {
        snapshot.memory = await this.memoryRelevant();
      } catch {
        snapshot.memory = {
          status: "error",
          reason: "Memory source failed",
        };
      }
    }

    this.audit.append({
      timestamp: new Date().toISOString(),
      toolId: "system.context",
      query,
      systemStatus: snapshot.system.status,
      applicationsStatus: snapshot.applications.status,
      screenStatus: snapshot.screen.status,
      activityStatus: snapshot.activity.status,
      presenceStatus: snapshot.presence.status,
      filesStatus: snapshot.files.status,
      result: "success",
      latencyMs: timing.totalMs,
    });

    return { snapshot, timing, query };
  }

  private async readApplications(): Promise<ContextApplicationsInfo> {
    try {
      const list = await this.applications!.list();
      const active = await this.applications!.active();
      if (!list.success) {
        return {
          status: mapAppError(list.error.code),
          reason: list.error.message,
        };
      }
      const running = list.data.applications
        .filter((a) => a.running === true)
        .map((a) => ({
          id: a.id ?? null,
          name: a.name ?? null,
          bundleId: a.bundleId ?? null,
        }));
      return {
        status: "available",
        running,
        active:
          active.success && active.data
            ? {
                id: active.data.id ?? null,
                name: active.data.name ?? null,
                bundleId: active.data.bundleId ?? null,
              }
            : null,
      };
    } catch (err) {
      return {
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async readScreen(): Promise<ContextScreenInfo> {
    try {
      const info = await this.screen!.info();
      if (!info.success) {
        return {
          status: mapScreenError(info.error.code),
          reason: info.error.message,
        };
      }
      const displays = info.data.screens.map((s) => ({
        id: s.id ?? null,
        width: s.width ?? null,
        height: s.height ?? null,
        isPrimary: s.isPrimary ?? null,
        scaleFactor: s.scaleFactor ?? null,
        bounds: s.bounds
          ? {
              x: s.bounds.x,
              y: s.bounds.y,
              width: s.bounds.width,
              height: s.bounds.height,
            }
          : null,
      }));

      let windows: ContextScreenInfo["windows"];
      let activeWindow: ContextScreenInfo["activeWindow"] = null;
      const win = await this.screen!.windows();
      if (win.success) {
        windows = win.data.windows.map((w) => ({
          id: w.id ?? null,
          title: w.title ?? null,
          applicationName: w.applicationName ?? null,
          bundleId: w.bundleId ?? null,
          bounds: w.bounds
            ? {
                x: w.bounds.x,
                y: w.bounds.y,
                width: w.bounds.width,
                height: w.bounds.height,
              }
            : null,
        }));
      }
      const active = await this.screen!.activeWindow();
      if (active.success && active.data.window) {
        activeWindow = {
          id: active.data.window.id ?? null,
          title: active.data.window.title ?? null,
          applicationName:
            active.data.window.applicationName ??
            active.data.application ??
            null,
          bundleId: active.data.window.bundleId ?? null,
          bounds: active.data.window.bounds
            ? {
                x: active.data.window.bounds.x,
                y: active.data.window.bounds.y,
                width: active.data.window.bounds.width,
                height: active.data.window.bounds.height,
              }
            : null,
        };
      }

      let session: ContextScreenInfo["session"] = null;
      const sess = await this.screen!.session();
      if (sess.success) {
        const hasAny =
          sess.data.locked != null || sess.data.userPresent != null;
        session = {
          locked: sess.data.locked,
          userPresent: sess.data.userPresent,
          status: hasAny ? "available" : "unknown",
        };
      } else {
        session = {
          locked: null,
          userPresent: null,
          status: mapScreenError(sess.error.code),
        };
      }

      return {
        status: "available",
        displays,
        windows,
        activeWindow,
        session,
        reason:
          !win.success
            ? `windows: ${win.error.code}`
            : !active.success
              ? `activeWindow: ${active.error.code}`
              : null,
      };
    } catch (err) {
      return {
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async readActivity(snapshot: ContextSnapshot): Promise<void> {
    try {
      const act = await this.activity!.getActivity();
      if (!act.success) {
        snapshot.activity = {
          status: "unknown",
          reason: act.error.message,
        };
        snapshot.presence = {
          status: "unknown",
          reason: act.error.message,
        };
        return;
      }
      if (act.data.status === "UNKNOWN" || act.data.source === "unavailable") {
        snapshot.activity = {
          status: "unknown",
          state: act.data.status,
          idleSeconds: act.data.idleSeconds,
          reason: "Activity observation unavailable",
        };
      } else {
        snapshot.activity = {
          status: "available",
          state: act.data.status,
          idleSeconds: act.data.idleSeconds,
        };
      }

      const pres = await this.activity!.getPresence();
      if (!pres.success) {
        snapshot.presence = {
          status: "unknown",
          reason: pres.error.message,
        };
        return;
      }
      if (pres.data.presence === "UNKNOWN") {
        snapshot.presence = {
          status: "unknown",
          presence: pres.data.presence,
          confidence: pres.data.confidence,
          reason: pres.data.reason,
        };
      } else {
        snapshot.presence = {
          status: "available",
          presence: pres.data.presence,
          confidence: pres.data.confidence,
          reason: pres.data.reason,
        };
      }
    } catch (err) {
      snapshot.activity = {
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      };
      snapshot.presence = {
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function mapObsAvailability(
  a: string,
): DomainStatus {
  switch (a) {
    case "available":
      return "available";
    case "permission_required":
      return "permission_required";
    case "error":
      return "error";
    default:
      return "unavailable";
  }
}

function mapObsApplications(obs: {
  applications: {
    availability: string;
    reason: string | null;
    applications: Array<{
      id?: string | null;
      name?: string | null;
      bundleId?: string | null;
    }> | null;
    activeApplication: {
      id?: string | null;
      name?: string | null;
      bundleId?: string | null;
    } | null;
  };
}): ContextApplicationsInfo {
  if (obs.applications.availability !== "available") {
    return {
      status: mapObsAvailability(obs.applications.availability),
      reason: obs.applications.reason,
    };
  }
  return {
    status: "available",
    running: (obs.applications.applications ?? []).map((a) => ({
      id: a.id ?? null,
      name: a.name ?? null,
      bundleId: a.bundleId ?? null,
    })),
    active: obs.applications.activeApplication
      ? {
          id: obs.applications.activeApplication.id ?? null,
          name: obs.applications.activeApplication.name ?? null,
          bundleId: obs.applications.activeApplication.bundleId ?? null,
        }
      : null,
  };
}

function mapAppError(code: string): DomainStatus {
  if (code.includes("PERMISSION")) return "permission_required";
  if (code.includes("UNAVAILABLE")) return "unavailable";
  return "error";
}

function mapScreenError(code: string): DomainStatus {
  if (code.includes("PERMISSION")) return "permission_required";
  if (code.includes("UNAVAILABLE")) return "unavailable";
  return "error";
}

function mapEnvAvail(code: string): EnvAvailability {
  if (code.includes("PERMISSION")) return "PERMISSION_REQUIRED";
  if (code.includes("UNAVAILABLE")) return "UNAVAILABLE";
  return "UNKNOWN";
}

function mapPerm(
  status: string | undefined,
): PermissionReportState {
  if (!status) return "UNKNOWN";
  if (status === "AVAILABLE") return "AVAILABLE";
  if (status === "PERMISSION_REQUIRED") return "REQUIRED";
  if (status === "UNAVAILABLE") return "DENIED";
  return "UNKNOWN";
}

function mapDomain(a: EnvAvailability): DomainStatus {
  switch (a) {
    case "AVAILABLE":
      return "available";
    case "PERMISSION_REQUIRED":
      return "permission_required";
    case "UNKNOWN":
      return "unknown";
    default:
      return "unavailable";
  }
}
