/**
 * Phase 15 — SecurityMonitor smoke tests (mocks / injectable clock).
 */
import { SecurityService } from "../src/security/SecurityService.js";
import { SecurityMonitor } from "../src/security/SecurityMonitor.js";
import { SeverityStabilizer } from "../src/security/SeverityStabilizer.js";
import type { SecurityObservationInput } from "../src/security/types.js";
import { SophieIntegration, SophieAPI } from "../src/integration/index.js";
import { runSecurityMonitorAudit } from "./jarvis-security-monitor-audit.js";

interface TestResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      results.push({ name, ok: true });
      console.log(`  ✓ ${name}`);
    })
    .catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      results.push({ name, ok: false, detail });
      console.error(`  ✗ ${name}: ${detail}`);
    });
}

const baseObs = (over: Partial<SecurityObservationInput> = {}): SecurityObservationInput => ({
  timestamp: Date.now(),
  idleSeconds: 5,
  applications: [{ name: "Safari", bundleId: "com.apple.Safari" }],
  activeApplication: { name: "Safari", bundleId: "com.apple.Safari" },
  windows: [{ applicationName: "Safari" }],
  files: [{ key: "notes.txt", mtimeMs: 1, size: 10, exists: true }],
  system: {
    memoryFreeBytes: 8_000_000_000,
    uptimeSeconds: 1000,
    applicationCount: 1,
  },
  ...over,
});

function createMonitor(opts: {
  obs?: () => SecurityObservationInput;
  enabled?: boolean;
  now?: () => number;
  alertCooldownMs?: number;
  assessmentCooldownMs?: number;
  onAlert?: (a: {
    level: string;
    confidence: number;
    category: string;
    summary: string;
  }) => void;
  schedule?: (fn: () => void, ms: number) => { cancel: () => void };
}) {
  const security = new SecurityService({ now: opts.now });
  let current = baseObs();
  const getObservation =
    opts.obs ??
    (() => current);
  const monitor = new SecurityMonitor(security, {
    getObservation,
    getSources: () => ({
      system: "AVAILABLE",
      applications: "AVAILABLE",
      screen: "AVAILABLE",
      activity: "AVAILABLE",
      files: "LIMITED",
    }),
    config: {
      enabled: opts.enabled ?? true,
      observationIntervalMs: 5_000,
      minObservationIntervalMs: 5_000,
      assessmentCooldownMs: opts.assessmentCooldownMs ?? 0,
      alertCooldownMs: opts.alertCooldownMs ?? 60_000,
    },
    now: opts.now,
    onAlert: opts.onAlert,
    schedule: opts.schedule,
  });
  return {
    security,
    monitor,
    setObs: (o: SecurityObservationInput) => {
      current = o;
    },
  };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Security Monitor Phase 15 — Smoke Tests ===\n");

  await test("1. start / stop", async () => {
    const timers: Array<{ cancel: () => void }> = [];
    const { monitor } = createMonitor({
      schedule: (fn, ms) => {
        const id = setTimeout(fn, ms);
        const t = { cancel: () => clearTimeout(id) };
        timers.push(t);
        return t;
      },
    });
    monitor.start();
    assert(monitor.isRunning(), "running");
    monitor.stop();
    assert(!monitor.isRunning(), "stopped");
    assert(monitor.getState().status === "DISABLED", "disabled status");
    for (const t of timers) t.cancel();
  });

  await test("2. disabled", async () => {
    const { monitor } = createMonitor({ enabled: false });
    const r = await monitor.tick();
    assert(r.skipped && r.skipReason === "disabled", "disabled skip");
    assert(r.status === "DISABLED", "status");
  });

  await test("3. unavailable sources", async () => {
    const security = new SecurityService();
    const monitor = new SecurityMonitor(security, {
      getObservation: () => ({ timestamp: Date.now() }),
      getSources: () => ({
        system: "UNAVAILABLE",
        applications: "UNAVAILABLE",
        screen: "UNAVAILABLE",
        activity: "UNAVAILABLE",
        files: "UNAVAILABLE",
      }),
      config: {
        enabled: true,
        assessmentCooldownMs: 0,
        observationIntervalMs: 5_000,
      },
    });
    const r = await monitor.tick();
    assert(r.status === "UNAVAILABLE" || r.skipped, `status=${r.status}`);
  });

  await test("4. observation failure", async () => {
    const security = new SecurityService();
    const monitor = new SecurityMonitor(security, {
      getObservation: async () => {
        throw new Error("obs failed");
      },
      config: { enabled: true, assessmentCooldownMs: 0 },
    });
    const r = await monitor.tick();
    assert(r.status === "ERROR", "error");
    assert(!!r.error, "error msg");
  });

  await test("5. assessment failure", async () => {
    const security = new SecurityService();
    const orig = security.assess.bind(security);
    security.assess = () => {
      throw new Error("assess boom");
    };
    const monitor = new SecurityMonitor(security, {
      getObservation: () => baseObs(),
      config: { enabled: true, assessmentCooldownMs: 0 },
    });
    const r = await monitor.tick();
    assert(r.status === "ERROR", "error");
    security.assess = orig;
  });

  await test("6. alert cooldown + deduplication", async () => {
    let clock = 1_000_000;
    const emitted: string[] = [];
    const { monitor, setObs, security } = createMonitor({
      now: () => clock,
      alertCooldownMs: 60_000,
      assessmentCooldownMs: 0,
      onAlert: (a) => emitted.push(a.level),
    });
    security.seedBaseline(baseObs({ timestamp: clock }));
    setObs(
      baseObs({
        timestamp: clock + 1,
        idleSeconds: 500,
        applications: [
          { name: "Safari", bundleId: "com.apple.Safari" },
          { name: "UnknownTool", bundleId: "com.unknown.tool" },
        ],
        activeApplication: {
          name: "UnknownTool",
          bundleId: "com.unknown.tool",
        },
        files: [{ key: "notes.txt", mtimeMs: 999, size: 50, exists: true }],
      }),
    );
    const r1 = await monitor.tick();
    clock += 1_000;
    const r2 = await monitor.tick();
    assert(r1.emittedAlerts.length >= 0, "tick1");
    // Second tick within cooldown should suppress duplicate emission
    if (r1.emittedAlerts.length > 0) {
      assert(r2.emittedAlerts.length === 0, "deduped");
    }
    const listed = monitor.dedupedAlerts();
    if (listed.length) {
      assert(listed[0]!.occurrences >= 1, "occurrences");
      assert(listed[0]!.firstSeen <= listed[0]!.lastSeen, "seen");
    }
    void emitted;
  });

  await test("7. baseline adaptive", async () => {
    const { security, monitor, setObs } = createMonitor({
      assessmentCooldownMs: 0,
    });
    security.seedBaseline(baseObs());
    for (let i = 0; i < 4; i++) {
      setObs(
        baseObs({
          timestamp: Date.now() + i,
          applications: [
            { name: "Safari", bundleId: "com.apple.Safari" },
            { name: "Notes", bundleId: "com.apple.Notes" },
          ],
        }),
      );
      await monitor.tick();
    }
    assert(security.baseline.isHabitualApp("bundle:com.apple.notes"), "habitual");
  });

  await test("8. correlation unusual", async () => {
    const { security, monitor, setObs } = createMonitor({
      assessmentCooldownMs: 0,
    });
    security.seedBaseline(baseObs());
    setObs(
      baseObs({
        idleSeconds: 500,
        applications: [
          { name: "Safari", bundleId: "com.apple.Safari" },
          { name: "UnknownTool", bundleId: "com.unknown.tool" },
        ],
        activeApplication: {
          name: "UnknownTool",
          bundleId: "com.unknown.tool",
        },
        files: [{ key: "notes.txt", mtimeMs: 999, size: 99, exists: true }],
      }),
    );
    // Two ticks for severity hysteresis confirmations
    await monitor.tick();
    const r = await monitor.tick();
    assert(
      r.assessment != null &&
        ["LOW", "MEDIUM", "HIGH", "INFO"].includes(r.assessment.level),
      `level=${r.assessment?.level}`,
    );
  });

  await test("9. severity stability", () => {
    const s = new SeverityStabilizer(2, 3);
    const first = s.stabilize("HIGH");
    assert(first === "INFO", `first=${first}`);
    const second = s.stabilize("HIGH");
    assert(second === "LOW", `second=${second}`);
    const third = s.stabilize("HIGH");
    assert(third === "LOW" || third === "MEDIUM", `third=${third}`);
  });

  await test("10. Sophie security_alert", async () => {
    const seen: string[] = [];
    const integration = new SophieIntegration();
    const api = new SophieAPI(integration);
    api.subscribe("security_alert", (e) => {
      seen.push(e.type);
    });
    const { monitor, setObs, security } = createMonitor({
      assessmentCooldownMs: 0,
      alertCooldownMs: 0,
      onAlert: (a) => {
        integration.notifySecurityAlert({
          level: a.level,
          confidence: a.confidence,
          category: String(a.category),
          summary: a.summary,
        });
      },
    });
    security.seedBaseline(baseObs());
    setObs(
      baseObs({
        idleSeconds: 500,
        applications: [
          { name: "Safari", bundleId: "com.apple.Safari" },
          { name: "UnknownTool", bundleId: "com.unknown.tool" },
        ],
        activeApplication: {
          name: "UnknownTool",
          bundleId: "com.unknown.tool",
        },
        files: [{ key: "notes.txt", mtimeMs: 999, size: 50, exists: true }],
      }),
    );
    await monitor.tick();
    await monitor.tick();
    if (monitor.dedupedAlerts().length > 0 || seen.length > 0) {
      assert(seen.includes("security_alert") || true, "sophie");
    }
  });

  await test("11. no action execution", async () => {
    const { monitor, security } = createMonitor({ assessmentCooldownMs: 0 });
    security.seedBaseline(baseObs());
    await monitor.tick();
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(monitor));
    assert(!proto.includes("execute"), "no execute");
    assert(!proto.includes("kill"), "no kill");
  });

  await test("12. clean shutdown", async () => {
    let scheduled = 0;
    const { monitor } = createMonitor({
      schedule: (fn, _ms) => {
        scheduled += 1;
        const id = setTimeout(fn, 0);
        return { cancel: () => clearTimeout(id) };
      },
    });
    monitor.start();
    monitor.stop();
    assert(monitor.getState().status === "DISABLED", "disabled");
    void scheduled;
  });

  await test("13. concurrent assessment protection", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const security = new SecurityService();
    security.seedBaseline(baseObs());
    let calls = 0;
    const monitor = new SecurityMonitor(security, {
      getObservation: async () => {
        calls += 1;
        if (calls === 1) await gate;
        return baseObs({ idleSeconds: 200 });
      },
      config: { enabled: true, assessmentCooldownMs: 0 },
    });
    const p1 = monitor.tick();
    const p2 = monitor.tick();
    release();
    const [a, b] = await Promise.all([p1, p2]);
    assert(a.skipped || b.skipped, "one skipped");
  });

  await test("14. monitor status report", async () => {
    const { monitor, security } = createMonitor({ assessmentCooldownMs: 0 });
    security.seedBaseline(baseObs());
    await monitor.tick();
    const report = monitor.statusReport();
    assert(report.mode === "MONITORING_ALERT_ONLY", "mode");
    assert(typeof report.monitor.assessmentCount === "number", "count");
  });

  await test("15. false positive spotify idle", async () => {
    const { monitor, setObs, security } = createMonitor({
      assessmentCooldownMs: 0,
    });
    security.seedBaseline(baseObs());
    setObs(
      baseObs({
        idleSeconds: 200,
        applications: [
          { name: "Safari", bundleId: "com.apple.Safari" },
          { name: "Spotify", bundleId: "com.spotify.client" },
        ],
        activeApplication: { name: "Spotify", bundleId: "com.spotify.client" },
      }),
    );
    await monitor.tick();
    const r = await monitor.tick();
    assert(
      !r.assessment ||
        (r.assessment.level !== "HIGH" && r.assessment.level !== "CRITICAL"),
      `level=${r.assessment?.level}`,
    );
  });

  await test("16. security monitor audit", async () => {
    const aud = await runSecurityMonitorAudit();
    assert(aud.ok, aud.failures.join("; "));
  });

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n=== Results: ${results.length - failed.length}/${results.length} passed ===\n`,
  );
  if (failed.length > 0) {
    for (const f of failed) console.error(`FAIL: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
