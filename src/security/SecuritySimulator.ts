/**
 * Offline simulation of many scenarios — NEVER presented as real detections.
 */
import { SecurityService } from "./SecurityService.js";
import type {
  SecurityObservationInput,
  SecuritySeverity,
} from "./types.js";

export type SimulationScenarioKind =
  | "normal_work"
  | "gaming"
  | "coding"
  | "idle"
  | "long_idle"
  | "application_change"
  | "file_change"
  | "multiple_changes"
  | "return_after_idle"
  | "unknown_environment"
  | "benign_spotify_while_idle"
  | "benign_chrome_while_idle";

export interface SimulationStats {
  total: number;
  falsePositiveHighOrAbove: number;
  falsePositiveRate: number;
  alertDistribution: Record<SecuritySeverity | "NONE", number>;
  confidenceBuckets: Record<string, number>;
  severityDistribution: Record<SecuritySeverity, number>;
  kindCounts: Record<string, number>;
  mode: "SIMULATION";
}

export function runSecuritySimulation(count: number = 3000): SimulationStats {
  const kinds: SimulationScenarioKind[] = [
    "normal_work",
    "gaming",
    "coding",
    "idle",
    "long_idle",
    "application_change",
    "file_change",
    "multiple_changes",
    "return_after_idle",
    "unknown_environment",
    "benign_spotify_while_idle",
    "benign_chrome_while_idle",
  ];

  const alertDistribution: Record<SecuritySeverity | "NONE", number> = {
    NONE: 0,
    INFO: 0,
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  const severityDistribution: Record<SecuritySeverity, number> = {
    INFO: 0,
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  const confidenceBuckets: Record<string, number> = {
    "0.0-0.3": 0,
    "0.3-0.5": 0,
    "0.5-0.7": 0,
    "0.7-1.0": 0,
  };
  const kindCounts: Record<string, number> = {};

  let falsePositiveHighOrAbove = 0;

  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length]!;
    kindCounts[kind] = (kindCounts[kind] ?? 0) + 1;

    const service = new SecurityService();
    const baseline = scenarioObservation(kind, "baseline", i);
    service.seedBaseline(baseline);
    const current = scenarioObservation(kind, "current", i);
    const result = service.assess(current);

    severityDistribution[result.assessment.level] += 1;
    const top = result.alerts[0];
    if (!top) alertDistribution.NONE += 1;
    else alertDistribution[top.level] += 1;

    const c = result.assessment.confidence;
    if (c < 0.3) confidenceBuckets["0.0-0.3"]! += 1;
    else if (c < 0.5) confidenceBuckets["0.3-0.5"]! += 1;
    else if (c < 0.7) confidenceBuckets["0.5-0.7"]! += 1;
    else confidenceBuckets["0.7-1.0"]! += 1;

    // False positive heuristic: benign scenarios should not reach HIGH/CRITICAL
    const benign = [
      "normal_work",
      "gaming",
      "coding",
      "idle",
      "benign_spotify_while_idle",
      "benign_chrome_while_idle",
      "return_after_idle",
    ].includes(kind);
    if (
      benign &&
      (result.assessment.level === "HIGH" ||
        result.assessment.level === "CRITICAL")
    ) {
      falsePositiveHighOrAbove += 1;
    }
  }

  return {
    total: count,
    falsePositiveHighOrAbove,
    falsePositiveRate: falsePositiveHighOrAbove / count,
    alertDistribution,
    confidenceBuckets,
    severityDistribution,
    kindCounts,
    mode: "SIMULATION",
  };
}

function scenarioObservation(
  kind: SimulationScenarioKind,
  phase: "baseline" | "current",
  seed: number,
): SecurityObservationInput {
  const ts = 1_700_000_000_000 + seed * 1000;
  const codingApps = [
    { name: "Cursor", bundleId: "com.todesktop.cursor" },
    { name: "Terminal", bundleId: "com.apple.Terminal" },
  ];
  const gameApps = [
    { name: "Steam", bundleId: "com.valvesoftware.steam" },
  ];
  const workApps = [
    { name: "Safari", bundleId: "com.apple.Safari" },
    { name: "Mail", bundleId: "com.apple.mail" },
  ];

  if (phase === "baseline") {
    return {
      timestamp: ts,
      idleSeconds: 5,
      applications: kind === "gaming" ? gameApps : kind === "coding" ? codingApps : workApps,
      activeApplication: kind === "gaming" ? gameApps[0]! : kind === "coding" ? codingApps[0]! : workApps[0]!,
      windows: [{ applicationName: "Safari" }],
      files: [{ key: "notes.txt", mtimeMs: 100, size: 10, exists: true }],
      system: {
        memoryFreeBytes: 8_000_000_000,
        uptimeSeconds: 10_000,
        applicationCount: 2,
      },
    };
  }

  switch (kind) {
    case "normal_work":
    case "coding":
    case "gaming":
      return {
        timestamp: ts + 60_000,
        idleSeconds: 3,
        applications:
          kind === "gaming" ? gameApps : kind === "coding" ? codingApps : workApps,
        activeApplication:
          kind === "gaming" ? gameApps[0]! : kind === "coding" ? codingApps[0]! : workApps[0]!,
        files: [{ key: "notes.txt", mtimeMs: 100, size: 10, exists: true }],
        system: {
          memoryFreeBytes: 7_500_000_000,
          uptimeSeconds: 10_060,
          applicationCount: 2,
        },
      };
    case "idle":
      return {
        timestamp: ts + 60_000,
        idleSeconds: 180,
        applications: workApps,
        activeApplication: workApps[0]!,
        files: [{ key: "notes.txt", mtimeMs: 100, size: 10, exists: true }],
        system: {
          memoryFreeBytes: 8_000_000_000,
          uptimeSeconds: 10_060,
          applicationCount: 2,
        },
      };
    case "long_idle":
      return {
        timestamp: ts + 60_000,
        idleSeconds: 1200,
        applications: workApps,
        activeApplication: workApps[0]!,
        files: [{ key: "notes.txt", mtimeMs: 100, size: 10, exists: true }],
        system: {
          memoryFreeBytes: 8_000_000_000,
          uptimeSeconds: 10_060,
          applicationCount: 2,
        },
      };
    case "benign_spotify_while_idle":
      return {
        timestamp: ts + 60_000,
        idleSeconds: 200,
        applications: [
          ...workApps,
          { name: "Spotify", bundleId: "com.spotify.client" },
        ],
        activeApplication: { name: "Spotify", bundleId: "com.spotify.client" },
        files: [{ key: "notes.txt", mtimeMs: 100, size: 10, exists: true }],
        system: {
          memoryFreeBytes: 7_000_000_000,
          uptimeSeconds: 10_060,
          applicationCount: 3,
        },
      };
    case "benign_chrome_while_idle":
      return {
        timestamp: ts + 60_000,
        idleSeconds: 200,
        applications: [
          ...workApps,
          { name: "Google Chrome", bundleId: "com.google.Chrome" },
        ],
        activeApplication: {
          name: "Google Chrome",
          bundleId: "com.google.Chrome",
        },
        files: [{ key: "notes.txt", mtimeMs: 100, size: 10, exists: true }],
        system: {
          memoryFreeBytes: 7_000_000_000,
          uptimeSeconds: 10_060,
          applicationCount: 3,
        },
      };
    case "application_change":
      return {
        timestamp: ts + 60_000,
        idleSeconds: 40,
        applications: [
          ...workApps,
          { name: "Notes", bundleId: "com.apple.Notes" },
        ],
        activeApplication: { name: "Notes", bundleId: "com.apple.Notes" },
        files: [{ key: "notes.txt", mtimeMs: 100, size: 10, exists: true }],
        system: {
          memoryFreeBytes: 8_000_000_000,
          uptimeSeconds: 10_060,
          applicationCount: 3,
        },
      };
    case "file_change":
      return {
        timestamp: ts + 60_000,
        idleSeconds: 10,
        applications: workApps,
        activeApplication: workApps[0]!,
        files: [{ key: "notes.txt", mtimeMs: 999, size: 50, exists: true }],
        system: {
          memoryFreeBytes: 8_000_000_000,
          uptimeSeconds: 10_060,
          applicationCount: 2,
        },
      };
    case "multiple_changes":
      return {
        timestamp: ts + 60_000,
        idleSeconds: 400,
        applications: [
          ...workApps,
          { name: "UnknownTool", bundleId: "com.unknown.tool" },
        ],
        activeApplication: {
          name: "UnknownTool",
          bundleId: "com.unknown.tool",
        },
        windows: [{ applicationName: "UnknownTool" }],
        files: [
          { key: "notes.txt", mtimeMs: 999, size: 99, exists: true },
          { key: "drop.scpt", mtimeMs: 1, size: 1, exists: true, extension: "scpt" },
        ],
        system: {
          memoryFreeBytes: 1_000_000_000,
          uptimeSeconds: 10_060,
          applicationCount: 3,
        },
      };
    case "return_after_idle":
      return {
        timestamp: ts + 60_000,
        idleSeconds: 2,
        applications: workApps,
        activeApplication: { name: "VS Code", bundleId: "com.microsoft.VSCode" },
        files: [{ key: "notes.txt", mtimeMs: 100, size: 10, exists: true }],
        system: {
          memoryFreeBytes: 8_000_000_000,
          uptimeSeconds: 10_060,
          applicationCount: 2,
        },
      };
    case "unknown_environment":
    default:
      return {
        timestamp: ts + 60_000,
        idleSeconds: null,
        applications: [],
        activeApplication: null,
        files: [],
        system: {},
      };
  }
}
