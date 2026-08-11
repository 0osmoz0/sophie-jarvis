/**
 * Map ContextSnapshot → SecurityObservationInput (metadata only).
 */
import type { ContextSnapshot, DomainStatus } from "../context/types.js";
import type { SecurityObservationInput } from "./types.js";
import type {
  SecuritySourceAvailability,
  SecuritySourceReport,
} from "./monitorTypes.js";

export function contextSnapshotToSecurityObservation(
  snapshot: ContextSnapshot,
): SecurityObservationInput {
  return {
    timestamp: snapshot.timestamp,
    idleSeconds:
      snapshot.activity.status === "available"
        ? snapshot.activity.idleSeconds ?? null
        : null,
    activityState: snapshot.activity.state ?? null,
    applications:
      snapshot.applications.status === "available"
        ? (snapshot.applications.running ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            bundleId: a.bundleId,
          }))
        : [],
    activeApplication:
      snapshot.applications.status === "available"
        ? snapshot.applications.active ?? null
        : null,
    windows:
      snapshot.screen.status === "available"
        ? (snapshot.screen.windows ?? []).map((w) => ({
            id: w.id,
            applicationName: w.applicationName,
          }))
        : [],
    activeWindow:
      snapshot.screen.status === "available"
        ? snapshot.screen.activeWindow
          ? { applicationName: snapshot.screen.activeWindow.applicationName }
          : null
        : null,
    files:
      snapshot.files.status === "available"
        ? (snapshot.files.configuredPaths ?? []).map((p) => ({
            key: basenameKey(p),
            exists: true,
          }))
        : [],
    system: {
      memoryFreeBytes: snapshot.system.memory?.freeBytes ?? null,
      memoryTotalBytes: snapshot.system.memory?.totalBytes ?? null,
      uptimeSeconds: snapshot.system.uptimeSeconds ?? null,
      applicationCount: snapshot.applications.running?.length ?? null,
    },
    sessionLocked: null,
  };
}

export function contextSnapshotToSecuritySources(
  snapshot: ContextSnapshot,
): SecuritySourceReport {
  return {
    system: mapDomain(snapshot.system.status),
    applications: mapDomain(snapshot.applications.status),
    screen: mapDomain(snapshot.screen.status),
    activity: mapDomain(snapshot.activity.status),
    files:
      snapshot.files.status === "available" &&
      (snapshot.files.configuredPaths?.length ?? 0) === 0
        ? "LIMITED"
        : mapDomain(snapshot.files.status),
  };
}

function mapDomain(status: DomainStatus): SecuritySourceAvailability {
  switch (status) {
    case "available":
      return "AVAILABLE";
    case "unavailable":
      return "UNAVAILABLE";
    case "permission_required":
      return "LIMITED";
    case "error":
      return "UNAVAILABLE";
    default:
      return "UNKNOWN";
  }
}

function basenameKey(p: string): string {
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1] || p;
}
