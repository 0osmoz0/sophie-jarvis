import type { ObservationService } from "../observation/ObservationService.js";
import type { ApplicationService } from "../applications/ApplicationService.js";
import type { ScreenService } from "../screen/ScreenService.js";
import type { UserActivityService } from "../presence/UserActivityService.js";
import type {
  ContextApplicationsInfo,
  ContextAuditSink,
  ContextQueryKind,
  ContextScreenInfo,
  ContextServiceResult,
  ContextSnapshot,
  ContextTiming,
  DomainStatus,
} from "./types.js";
import { MemoryContextAuditLog } from "./ContextAuditLog.js";

export interface ContextServiceOptions {
  observation?: ObservationService;
  applications?: ApplicationService;
  screen?: ScreenService;
  activity?: UserActivityService;
  audit?: ContextAuditSink;
}

/**
 * ContextService — read-only façade over existing observation services.
 * Never invents values. Never triggers actions.
 */
export class ContextService {
  private readonly observation: ObservationService | undefined;
  private readonly applications: ApplicationService | undefined;
  private readonly screen: ScreenService | undefined;
  private readonly activity: UserActivityService | undefined;
  private readonly audit: ContextAuditSink;

  constructor(options: ContextServiceOptions = {}) {
    this.observation = options.observation;
    this.applications = options.applications;
    this.screen = options.screen;
    this.activity = options.activity;
    this.audit = options.audit ?? new MemoryContextAuditLog();
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
      }));

      let windows: ContextScreenInfo["windows"];
      let activeWindow: ContextScreenInfo["activeWindow"] = null;
      const win = await this.screen!.windows();
      if (win.success) {
        windows = win.data.windows.map((w) => ({
          id: w.id ?? null,
          title: w.title ?? null,
          applicationName: w.applicationName ?? null,
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
        };
      }

      return {
        status: "available",
        displays,
        windows,
        activeWindow,
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
