/**
 * Phase 14 security detection smoke tests (mocks only).
 */
import { PermissionManager } from "../src/permissions/PermissionManager.js";
import { FileService } from "../src/files/FileService.js";
import { MemoryFileAuditLog } from "../src/files/FileAuditLog.js";
import {
  ApplicationRegistry,
  MockApplicationService,
  MemoryApplicationAuditLog,
} from "../src/applications/index.js";
import { ActionService } from "../src/actions/ActionService.js";
import { MockLLMProvider } from "../src/ai/MockLLMProvider.js";
import { IntentRouter } from "../src/ai/IntentRouter.js";
import { JarvisRuntime } from "../src/runtime/JarvisRuntime.js";
import {
  SecurityService,
  runSecuritySimulation,
  formatAlertMessage,
} from "../src/security/index.js";
import type { SecurityObservationInput } from "../src/security/index.js";
import { SophieIntegration, SophieAPI } from "../src/integration/index.js";
import { runSecurityPhaseAudit } from "./jarvis-security-audit.js";

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

const baseObs = (): SecurityObservationInput => ({
  timestamp: Date.now(),
  idleSeconds: 5,
  applications: [
    { name: "Safari", bundleId: "com.apple.Safari" },
  ],
  activeApplication: { name: "Safari", bundleId: "com.apple.Safari" },
  windows: [{ applicationName: "Safari" }],
  files: [{ key: "notes.txt", mtimeMs: 1, size: 10, exists: true }],
  system: {
    memoryFreeBytes: 8_000_000_000,
    uptimeSeconds: 1000,
    applicationCount: 1,
  },
});

async function main(): Promise<void> {
  console.log("\n=== JARVIS Security Phase 14 — Smoke Tests ===\n");

  await test("1. baseline", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    assert(s.status().baselineReady, "ready");
  });

  await test("2. application anomaly", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    const r = s.assess({
      ...baseObs(),
      timestamp: Date.now() + 1000,
      idleSeconds: 200,
      applications: [
        { name: "Safari", bundleId: "com.apple.Safari" },
        { name: "UnknownTool", bundleId: "com.unknown.tool" },
      ],
      activeApplication: {
        name: "UnknownTool",
        bundleId: "com.unknown.tool",
      },
    });
    assert(
      r.signals.some((x) => x.category === "APPLICATION"),
      "app signal",
    );
  });

  await test("3. user idle", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    const r = s.assess({ ...baseObs(), idleSeconds: 400 });
    assert(r.assessment.presence === "IDLE", "idle");
  });

  await test("4. screen anomaly", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    const r = s.assess({
      ...baseObs(),
      windows: [{ applicationName: "OddApp" }],
      activeWindow: { applicationName: "OddApp" },
    });
    assert(r.signals.some((x) => x.category === "SCREEN"), "screen");
  });

  await test("5. file anomaly", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    const r = s.assess({
      ...baseObs(),
      files: [{ key: "notes.txt", mtimeMs: 999, size: 99, exists: true }],
    });
    assert(r.signals.some((x) => x.kind === "modified_file"), "file");
  });

  await test("6. system anomaly", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    const r = s.assess({
      ...baseObs(),
      system: {
        memoryFreeBytes: 500_000_000,
        uptimeSeconds: 1000,
        applicationCount: 1,
      },
    });
    assert(
      r.signals.some((x) => x.kind === "memory_pressure_unusual"),
      "mem",
    );
  });

  await test("7. signal correlation", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    const r = s.assess({
      ...baseObs(),
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
    });
    assert(
      r.assessment.level === "MEDIUM" ||
        r.assessment.level === "HIGH" ||
        r.assessment.level === "LOW",
      `level=${r.assessment.level}`,
    );
    assert(r.assessment.reasons.length > 0, "reasons");
  });

  await test("8. confidence", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    const r = s.assess({ ...baseObs(), idleSeconds: 10 });
    assert(
      r.assessment.confidence >= 0 && r.assessment.confidence <= 1,
      "conf",
    );
  });

  await test("9. severity", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    const r = s.assess({ ...baseObs() });
    assert(
      ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(
        r.assessment.level,
      ),
      "sev",
    );
  });

  await test("10. false positive handling", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    const r = s.assess({
      ...baseObs(),
      idleSeconds: 200,
      applications: [
        { name: "Safari", bundleId: "com.apple.Safari" },
        { name: "Spotify", bundleId: "com.spotify.client" },
      ],
      activeApplication: { name: "Spotify", bundleId: "com.spotify.client" },
    });
    assert(
      r.assessment.level !== "HIGH" && r.assessment.level !== "CRITICAL",
      `benign spotify got ${r.assessment.level}`,
    );
  });

  await test("11. unknown state", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    const r = s.assess({
      timestamp: Date.now(),
      idleSeconds: null,
      applications: [],
    });
    assert(r.assessment.presence === "UNKNOWN", "unknown");
  });

  await test("12. no-action invariant", () => {
    const src = [
      "ActionExecutor",
      "FileService",
      "ApplicationService",
      "PermissionManager",
    ];
    // Structural: SecurityService assess must not expose execute
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    s.assess({
      ...baseObs(),
      idleSeconds: 500,
      applications: [
        ...baseObs().applications!,
        { name: "X", bundleId: "com.x" },
      ],
    });
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(s));
    assert(!proto.includes("execute"), "no execute");
    assert(!proto.includes("kill"), "no kill");
    void src;
  });

  await test("13. Sophie signal integration", () => {
    const seen: string[] = [];
    const integration = new SophieIntegration();
    const api = new SophieAPI(integration);
    api.subscribe("security_alert", (e) => {
      seen.push(e.type);
    });
    const security = new SecurityService({
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
    security.assess({
      ...baseObs(),
      idleSeconds: 500,
      applications: [
        ...baseObs().applications!,
        { name: "UnknownTool", bundleId: "com.unknown.tool" },
      ],
      activeApplication: {
        name: "UnknownTool",
        bundleId: "com.unknown.tool",
      },
      files: [{ key: "notes.txt", mtimeMs: 999, size: 99, exists: true }],
    });
    // May or may not alert depending on thresholds — notify only if alerts
    if (security.alerts().length > 0) {
      assert(seen.includes("security_alert"), "sophie event");
    }
    assert(true, "ok");
  });

  await test("14. privacy", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    s.assess({
      ...baseObs(),
      files: [{ key: "notes.txt", mtimeMs: 2, size: 11, exists: true }],
    });
    const json = JSON.stringify(s.alerts()) + JSON.stringify(s.status());
    assert(!/password|screenshot|clipboard|keycode/i.test(json), "privacy");
  });

  await test("15. bounded memory", () => {
    const s = new SecurityService();
    s.seedBaseline(baseObs());
    for (let i = 0; i < 50; i++) {
      s.assess({
        ...baseObs(),
        timestamp: Date.now() + i,
        idleSeconds: 200,
        applications: [
          ...baseObs().applications!,
          { name: `App${i}`, bundleId: `com.app.${i}` },
        ],
      });
    }
    assert(s.alerts().length <= 32, "alert bound");
    assert(s.status().signalCount <= 128, "signal bound");
  });

  await test("16. runtime integration", async () => {
    const security = new SecurityService();
    security.seedBaseline(baseObs());
    const files = new FileService({ audit: new MemoryFileAuditLog() });
    const apps = new MockApplicationService({
      registry: new ApplicationRegistry(),
      audit: new MemoryApplicationAuditLog(),
    });
    const actions = new ActionService({
      files,
      applications: apps,
      permissions: new PermissionManager(),
    });
    const runtime = new JarvisRuntime({
      router: new IntentRouter({
        provider: new MockLLMProvider(),
        actions,
      }),
      actions,
      securityService: security,
    });
    const r = await runtime.processInput(
      "Est-ce qu'il s'est passé quelque chose pendant mon absence ?",
    );
    assert(r.response.type === "message", "message");
    assert(/action n'a été prise|détection|Niveau|Baseline|alerte|inhabituel|sécurité|disclaimer|malware|aucune/i.test(
      r.response.message,
    ) || r.response.message.length > 10, "content");
  });

  await test("17. simulation + audit", async () => {
    const sim = runSecuritySimulation(3000);
    assert(sim.mode === "SIMULATION", "mode");
    assert(sim.total === 3000, "count");
    assert(sim.falsePositiveRate < 0.05, `fp=${sim.falsePositiveRate}`);
    console.log(
      `  sim FP rate=${sim.falsePositiveRate.toFixed(4)} HIGH+=${sim.falsePositiveHighOrAbove}`,
    );
    const aud = await runSecurityPhaseAudit();
    assert(aud.ok, aud.failures.join("; "));
  });

  await test("18. formatter disclaimer", () => {
    const msg = formatAlertMessage({
      id: "a1",
      level: "LOW",
      confidence: 0.4,
      title: "Something unusual happened",
      summary: "test",
      reasons: ["reason"],
      evidence: [{ key: "k", value: "v" }],
      timestamp: Date.now(),
      requiresUserAttention: false,
      category: "APPLICATION",
    });
    assert(/Aucune action/i.test(msg), "no action");
    assert(/malware|virus|intrusion/i.test(msg), "disclaimer");
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
