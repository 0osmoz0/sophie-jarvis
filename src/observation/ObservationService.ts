import type { EventBus } from "../core/EventBus.js";
import { SystemObserver } from "./SystemObserver.js";
import { ProcessObserver } from "./ProcessObserver.js";
import { ApplicationObserver } from "./ApplicationObserver.js";
import { UserActivityObserver } from "./UserActivityObserver.js";
import { FileObserver } from "./FileObserver.js";
import { ScreenObserver } from "./ScreenObserver.js";
import { ObservationCache } from "./ObservationCache.js";
import type {
  ApplicationInfo,
  ObservationServiceConfig,
  ObservationSnapshot,
  UserActivityState,
} from "./types.js";

export interface ObservationServiceOptions extends ObservationServiceConfig {
  events?: EventBus;
  systemObserver?: SystemObserver;
  processObserver?: ProcessObserver;
  applicationObserver?: ApplicationObserver;
  userActivityObserver?: UserActivityObserver;
  fileObserverInstance?: FileObserver;
  screenObserver?: ScreenObserver;
}

const DEFAULT_CACHE_TTL_MS = 2_000;

/**
 * ObservationService — aggregates READ ONLY observers into one snapshot.
 * A failing observer must not take down the whole service.
 */
export class ObservationService {
  private readonly events: EventBus | undefined;
  private readonly systemObserver: SystemObserver;
  private readonly processObserver: ProcessObserver;
  private readonly applicationObserver: ApplicationObserver;
  private readonly userActivityObserver: UserActivityObserver;
  private readonly fileObserver: FileObserver;
  private readonly screenObserver: ScreenObserver;
  private readonly cache: ObservationCache<ObservationSnapshot>;

  private lastUserActivity: UserActivityState | null = null;
  private lastActiveApplicationKey: string | null = null;
  private hasEmittedInitialActivity = false;
  private hasEmittedInitialActiveApp = false;

  constructor(options: ObservationServiceOptions = {}) {
    this.events = options.events;
    this.systemObserver = options.systemObserver ?? new SystemObserver();
    this.processObserver = options.processObserver ?? new ProcessObserver();
    this.applicationObserver =
      options.applicationObserver ?? new ApplicationObserver();
    this.userActivityObserver =
      options.userActivityObserver ?? new UserActivityObserver();
    this.fileObserver =
      options.fileObserverInstance ??
      new FileObserver(options.files ?? { paths: [] });
    this.screenObserver = options.screenObserver ?? new ScreenObserver();
    this.cache = new ObservationCache(
      options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    );
  }

  /** Produce an ObservationSnapshot (cached unless bypassCache). */
  async snapshot(options?: {
    bypassCache?: boolean;
  }): Promise<ObservationSnapshot> {
    if (!options?.bypassCache) {
      const cached = this.cache.get();
      if (cached) return cached;
    }

    const timestamp = new Date().toISOString();

    const system = this.safeSync(() => this.systemObserver.observe(), {
      availability: "error" as const,
      reason: "SystemObserver failed",
      platform: null,
      arch: null,
      hostname: null,
      cpu: null,
      memory: null,
      uptimeSeconds: null,
      battery: null,
    });

    const processes = this.safeSync(() => this.processObserver.observe(), {
      availability: "error" as const,
      reason: "ProcessObserver failed",
      processes: null,
    });

    const applications = this.safeSync(() => this.applicationObserver.observe(), {
      availability: "error" as const,
      reason: "ApplicationObserver failed",
      applications: null,
      activeApplication: null,
    });

    const userActivity = this.safeSync(() => this.userActivityObserver.observe(), {
      availability: "error" as const,
      reason: "UserActivityObserver failed",
      state: "UNKNOWN" as const,
      lastActivityAt: null,
      idleDurationMs: null,
      recordsKeyContent: false as const,
      recordsMouseCoordinates: false as const,
    });

    const files = await this.safeAsync(() => this.fileObserver.observe(), {
      availability: "error" as const,
      reason: "FileObserver failed",
      configuredPaths: this.fileObserver.getConfiguredPaths(),
      entries: [],
    });

    const screen = this.safeSync(() => this.screenObserver.observe(), {
      available: false,
      imageData: null,
      reason: "ScreenObserver failed",
    });

    const activeApplication: ApplicationInfo | null =
      applications.activeApplication ?? null;

    const snapshot: ObservationSnapshot = {
      timestamp,
      system,
      processes,
      applications,
      activeApplication,
      userActivity,
      files,
      screen,
    };

    this.emitChanges(snapshot);
    this.cache.set(snapshot);
    return snapshot;
  }

  clearCache(): void {
    this.cache.clear();
  }

  isCacheFresh(): boolean {
    return this.cache.isFresh();
  }

  getFileConfiguredPaths(): string[] {
    return this.fileObserver.getConfiguredPaths();
  }

  private emitChanges(snapshot: ObservationSnapshot): void {
    if (!this.events) return;

    this.events.emit("observation_updated", {
      timestamp: snapshot.timestamp,
    });

    const activity = snapshot.userActivity.state;
    if (
      this.hasEmittedInitialActivity &&
      this.lastUserActivity !== null &&
      this.lastUserActivity !== activity
    ) {
      this.events.emit("user_activity_changed", {
        previous: this.lastUserActivity,
        current: activity,
      });
    }
    this.lastUserActivity = activity;
    this.hasEmittedInitialActivity = true;

    const activeKey = activeApplicationKey(snapshot.activeApplication);
    if (
      this.hasEmittedInitialActiveApp &&
      this.lastActiveApplicationKey !== activeKey
    ) {
      this.events.emit("active_application_changed", {
        previous: this.lastActiveApplicationKey || null,
        current: activeKey || null,
      });
    }
    this.lastActiveApplicationKey = activeKey;
    this.hasEmittedInitialActiveApp = true;
  }

  private safeSync<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (fallback && typeof fallback === "object" && fallback !== null) {
        return { ...fallback, reason: message };
      }
      return fallback;
    }
  }

  private async safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (fallback && typeof fallback === "object" && fallback !== null) {
        return { ...fallback, reason: message };
      }
      return fallback;
    }
  }
}

function activeApplicationKey(app: ApplicationInfo | null): string {
  if (!app) return "";
  return app.bundleId || app.id || app.name || "";
}
