/**
 * Phase 15 — Security monitor simulation + performance benchmarks.
 * MODE: SIMULATION — never present as live detections.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SecurityService } from "../src/security/SecurityService.js";
import { SecurityMonitor } from "../src/security/SecurityMonitor.js";
import type {
  SecurityObservationInput,
  SecuritySeverity,
} from "../src/security/types.js";

type Scenario =
  | "coding"
  | "gaming"
  | "browsing"
  | "music"
  | "idle"
  | "returning"
  | "chrome"
  | "safari"
  | "spotify"
  | "cursor"
  | "new_app"
  | "unusual_app"
  | "frontmost_change"
  | "unusual_file"
  | "multiple_idle_changes"
  | "correlated"
  | "fp_spotify_idle"
  | "fp_chrome_idle"
  | "fp_gaming_idle"
  | "fp_coding_multi";

interface SimStats {
  mode: "SIMULATION";
  count: number;
  normal: number;
  unusual: number;
  correlated: number;
  falsePositiveHigh: number;
  falsePositiveRate: number;
  severity: Record<SecuritySeverity, number>;
  performance: {
    average: number;
    p50: number;
    p95: number;
    max: number;
    samples: number;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

function base(
  seed: number,
  over: Partial<SecurityObservationInput> = {},
): SecurityObservationInput {
  return {
    timestamp: 1_700_000_000_000 + seed * 1000,
    idleSeconds: 5,
    applications: [
      { name: "Safari", bundleId: "com.apple.Safari" },
      { name: "Mail", bundleId: "com.apple.mail" },
    ],
    activeApplication: { name: "Safari", bundleId: "com.apple.Safari" },
    windows: [{ applicationName: "Safari" }],
    files: [{ key: "notes.txt", mtimeMs: 100, size: 10, exists: true }],
    system: {
      memoryFreeBytes: 8_000_000_000,
      uptimeSeconds: 10_000,
      applicationCount: 2,
    },
    ...over,
  };
}

function scenarioPair(
  kind: Scenario,
  seed: number,
): { baseline: SecurityObservationInput; current: SecurityObservationInput } {
  const coding = [
    { name: "Cursor", bundleId: "com.todesktop.cursor" },
    { name: "Terminal", bundleId: "com.apple.Terminal" },
  ];
  const gaming = [{ name: "Steam", bundleId: "com.valvesoftware.steam" }];
  const browse = [
    { name: "Safari", bundleId: "com.apple.Safari" },
    { name: "Google Chrome", bundleId: "com.google.Chrome" },
  ];

  const baseline = base(seed);
  let current = base(seed + 1);

  switch (kind) {
    case "coding":
      current = base(seed + 1, {
        applications: coding,
        activeApplication: coding[0]!,
        idleSeconds: 3,
      });
      break;
    case "gaming":
      current = base(seed + 1, {
        applications: gaming,
        activeApplication: gaming[0]!,
        idleSeconds: 8,
      });
      break;
    case "browsing":
    case "chrome":
    case "safari":
      current = base(seed + 1, {
        applications: browse,
        activeApplication:
          kind === "chrome"
            ? browse[1]!
            : browse[0]!,
        idleSeconds: 4,
      });
      break;
    case "music":
    case "spotify":
    case "fp_spotify_idle":
      current = base(seed + 1, {
        idleSeconds: kind.startsWith("fp_") || kind === "spotify" ? 200 : 10,
        applications: [
          ...baseline.applications!,
          { name: "Spotify", bundleId: "com.spotify.client" },
        ],
        activeApplication: { name: "Spotify", bundleId: "com.spotify.client" },
      });
      break;
    case "idle":
      current = base(seed + 1, { idleSeconds: 180 });
      break;
    case "returning":
      current = base(seed + 1, {
        idleSeconds: 2,
        activeApplication: {
          name: "VS Code",
          bundleId: "com.microsoft.VSCode",
        },
        applications: [
          ...baseline.applications!,
          { name: "VS Code", bundleId: "com.microsoft.VSCode" },
        ],
      });
      break;
    case "cursor":
      current = base(seed + 1, {
        applications: coding,
        activeApplication: coding[0]!,
      });
      break;
    case "fp_chrome_idle":
      current = base(seed + 1, {
        idleSeconds: 200,
        applications: [
          ...baseline.applications!,
          { name: "Google Chrome", bundleId: "com.google.Chrome" },
        ],
        activeApplication: {
          name: "Google Chrome",
          bundleId: "com.google.Chrome",
        },
      });
      break;
    case "fp_gaming_idle":
      current = base(seed + 1, {
        idleSeconds: 150,
        applications: gaming,
        activeApplication: gaming[0]!,
      });
      break;
    case "fp_coding_multi":
      current = base(seed + 1, {
        idleSeconds: 20,
        applications: [
          ...coding,
          { name: "Slack", bundleId: "com.tinyspeck.slackmacgap" },
        ],
        activeApplication: coding[0]!,
      });
      break;
    case "new_app":
      current = base(seed + 1, {
        idleSeconds: 40,
        applications: [
          ...baseline.applications!,
          { name: "Notes", bundleId: "com.apple.Notes" },
        ],
      });
      break;
    case "unusual_app":
      current = base(seed + 1, {
        idleSeconds: 300,
        applications: [
          ...baseline.applications!,
          { name: "UnknownTool", bundleId: "com.unknown.tool" },
        ],
        activeApplication: {
          name: "UnknownTool",
          bundleId: "com.unknown.tool",
        },
      });
      break;
    case "frontmost_change":
      current = base(seed + 1, {
        activeApplication: { name: "Mail", bundleId: "com.apple.mail" },
      });
      break;
    case "unusual_file":
      current = base(seed + 1, {
        files: [{ key: "notes.txt", mtimeMs: 999, size: 50, exists: true }],
      });
      break;
    case "multiple_idle_changes":
    case "correlated":
      current = base(seed + 1, {
        idleSeconds: 400,
        applications: [
          ...baseline.applications!,
          { name: "UnknownTool", bundleId: "com.unknown.tool" },
        ],
        activeApplication: {
          name: "UnknownTool",
          bundleId: "com.unknown.tool",
        },
        windows: [{ applicationName: "UnknownTool" }],
        files: [
          { key: "notes.txt", mtimeMs: 999, size: 99, exists: true },
          {
            key: "drop.scpt",
            mtimeMs: 1,
            size: 1,
            exists: true,
            extension: "scpt",
          },
        ],
        system: {
          memoryFreeBytes: 1_000_000_000,
          uptimeSeconds: 10_060,
          applicationCount: 3,
        },
      });
      break;
  }

  return { baseline, current };
}

const NORMAL: Scenario[] = [
  "coding",
  "gaming",
  "browsing",
  "music",
  "idle",
  "returning",
  "chrome",
  "safari",
  "spotify",
  "cursor",
  "fp_spotify_idle",
  "fp_chrome_idle",
  "fp_gaming_idle",
  "fp_coding_multi",
];
const UNUSUAL: Scenario[] = [
  "new_app",
  "unusual_app",
  "frontmost_change",
  "unusual_file",
  "multiple_idle_changes",
];
const CORRELATED: Scenario[] = ["correlated"];

export async function runSecurityMonitorSimulationAsync(
  count = 2000,
): Promise<SimStats> {
  const kinds: Scenario[] = [...NORMAL, ...UNUSUAL, ...CORRELATED];
  const severity: Record<SecuritySeverity, number> = {
    INFO: 0,
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  let falsePositiveHigh = 0;
  let normal = 0;
  let unusual = 0;
  let correlated = 0;
  const times: number[] = [];

  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length]!;
    if (NORMAL.includes(kind)) normal += 1;
    else if (CORRELATED.includes(kind)) correlated += 1;
    else unusual += 1;

    const { baseline, current } = scenarioPair(kind, i);
    const security = new SecurityService();
    let obs = baseline;
    const monitor = new SecurityMonitor(security, {
      getObservation: () => obs,
      config: {
        enabled: true,
        assessmentCooldownMs: 0,
        alertCooldownMs: 0,
        observationIntervalMs: 5_000,
      },
    });
    security.seedBaseline(baseline);
    obs = current;
    const t0 = Date.now();
    await monitor.tick();
    const r = await monitor.tick();
    times.push(Date.now() - t0);

    const level = r.assessment?.level ?? "INFO";
    severity[level] += 1;

    if (
      NORMAL.includes(kind) &&
      (level === "HIGH" || level === "CRITICAL")
    ) {
      falsePositiveHigh += 1;
    }
  }

  times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);

  return {
    mode: "SIMULATION",
    count,
    normal,
    unusual,
    correlated,
    falsePositiveHigh,
    falsePositiveRate: falsePositiveHigh / count,
    severity,
    performance: {
      average: times.length ? sum / times.length : 0,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      max: times.length ? times[times.length - 1]! : 0,
      samples: times.length,
    },
  };
}

export async function benchmarkMonitorTicks(
  samples: number,
): Promise<{ average: number; p50: number; p95: number; max: number }> {
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const security = new SecurityService();
    const baseline = base(i);
    let obs = baseline;
    const monitor = new SecurityMonitor(security, {
      getObservation: () => obs,
      config: { enabled: true, assessmentCooldownMs: 0 },
    });
    security.seedBaseline(baseline);
    obs = base(i + 1, { idleSeconds: 10 });
    const t0 = Date.now();
    await monitor.tick();
    times.push(Date.now() - t0);
  }
  times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  return {
    average: sum / times.length,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    max: times[times.length - 1]!,
  };
}

const isDirect =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  (async () => {
    console.log("\n=== JARVIS Security Monitor Simulation (SIMULATION) ===\n");
    const sim = await runSecurityMonitorSimulationAsync(2000);
    console.log(JSON.stringify(sim, null, 2));
    assert(sim.mode === "SIMULATION", "mode");
    assert(sim.falsePositiveRate < 0.05, `fp=${sim.falsePositiveRate}`);

    console.log("\nBenchmark 100 observations...");
    const b100 = await benchmarkMonitorTicks(100);
    console.log(b100);

    console.log("\nBenchmark 1000 simulated observations...");
    const b1000 = await benchmarkMonitorTicks(1000);
    console.log(b1000);

    console.log("\nSimulation PASSED.\n");
  })().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

function assert(c: boolean, m: string): void {
  if (!c) throw new Error(m);
}
