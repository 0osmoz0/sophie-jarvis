import { EventBus } from "../src/core/EventBus.js";
import { JarvisCore, JarvisCoreError } from "../src/core/JarvisCore.js";
import { PermissionManager } from "../src/permissions/PermissionManager.js";
import { RiskLevel } from "../src/permissions/RiskLevel.js";
import { TaskManager } from "../src/core/TaskManager.js";
import { ToolRegistry } from "../src/tools/ToolRegistry.js";
import { systemInfoTool } from "../src/tools/systemInfo.js";
import { createSystemObserveTool } from "../src/tools/systemObserve.js";
import { SystemObserver } from "../src/observation/SystemObserver.js";
import { ProcessObserver } from "../src/observation/ProcessObserver.js";
import { ApplicationObserver } from "../src/observation/ApplicationObserver.js";
import { UserActivityObserver } from "../src/observation/UserActivityObserver.js";
import { FileObserver } from "../src/observation/FileObserver.js";
import { ScreenObserver } from "../src/observation/ScreenObserver.js";
import { ObservationCache } from "../src/observation/ObservationCache.js";
import { ObservationService } from "../src/observation/ObservationService.js";
import type {
  ObservationSnapshot,
  ProcessObservation,
  SystemObservation,
} from "../src/observation/types.js";
import { runObservationAudit } from "./jarvis-observation-audit.js";

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

function assertSnapshotShape(snapshot: ObservationSnapshot): void {
  assert(typeof snapshot.timestamp === "string", "timestamp");
  assert(snapshot.system !== undefined, "system");
  assert(snapshot.processes !== undefined, "processes");
  assert(snapshot.applications !== undefined, "applications");
  assert("activeApplication" in snapshot, "activeApplication");
  assert(snapshot.userActivity !== undefined, "userActivity");
  assert(snapshot.files !== undefined, "files");
  assert(snapshot.screen !== undefined, "screen");
  assert(snapshot.userActivity.recordsKeyContent === false, "no key content");
  assert(snapshot.userActivity.recordsMouseCoordinates === false, "no mouse coords");
  assert(snapshot.screen.imageData === null, "no image data");
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Observation Phase 2 — Smoke Tests ===\n");

  console.log("1) SystemObserver");
  await test("collects read-only os metadata", () => {
    const obs = new SystemObserver().observe();
    assert(obs.availability === "available", "available");
    assert(typeof obs.platform === "string", "platform");
    assert(typeof obs.arch === "string", "arch");
    assert(obs.cpu !== null && typeof obs.cpu.cores === "number", "cpu");
    assert(obs.memory !== null && typeof obs.memory.totalBytes === "number", "memory");
    assert(typeof obs.uptimeSeconds === "number", "uptime");
    assert(obs.battery !== null && obs.battery.available === false, "battery unavailable");
    assert(obs.battery !== null && obs.battery.percent === null, "battery not invented");
  });

  console.log("\n2) ProcessObserver");
  await test("returns unavailable without shell", () => {
    const obs = new ProcessObserver().observe();
    assert(obs.availability === "unavailable", "unavailable");
    assert(obs.processes === null, "processes null");
  });

  console.log("\n3) ApplicationObserver");
  await test("returns unavailable without native/AppleScript", () => {
    const obs = new ApplicationObserver().observe();
    assert(obs.availability === "unavailable", "unavailable");
    assert(obs.applications === null, "apps null");
    assert(obs.activeApplication === null, "active null");
  });

  console.log("\n4) UserActivityObserver");
  await test("returns UNKNOWN without recording keys", () => {
    const obs = new UserActivityObserver().observe();
    assert(obs.state === "UNKNOWN", "UNKNOWN");
    assert(obs.lastActivityAt === null, "no last activity invented");
    assert(obs.recordsKeyContent === false, "no keys");
    assert(obs.recordsMouseCoordinates === false, "no mouse");
  });

  console.log("\n5) FileObserver");
  await test("default paths are empty", async () => {
    const fo = new FileObserver();
    assert(fo.getConfiguredPaths().length === 0, "empty paths");
    const obs = await fo.observe();
    assert(obs.configuredPaths.length === 0, "configured empty");
    assert(obs.entries.length === 0, "no entries");
    assert(obs.availability === "available", "idle available");
  });

  console.log("\n6) ScreenObserver");
  await test("does not capture any image", () => {
    const screen = new ScreenObserver().observe();
    assert(screen.available === false, "not available");
    assert(screen.imageData === null, "no image");
    assert(screen.width === undefined, "no invented width");
    assert(screen.height === undefined, "no invented height");
  });

  console.log("\n7) ObservationService");
  await test("snapshot is always structured", async () => {
    const service = new ObservationService();
    const snapshot = await service.snapshot();
    assertSnapshotShape(snapshot);
    assert(snapshot.activeApplication === null, "activeApplication null");
    assert(snapshot.files.configuredPaths.length === 0, "no file paths");
  });

  await test("one failing observer does not break others", async () => {
    class BoomSystem extends SystemObserver {
      override observe(): SystemObservation {
        throw new Error("boom-system");
      }
    }
    class BoomProcess extends ProcessObserver {
      override observe(): ProcessObservation {
        throw new Error("boom-process");
      }
    }
    const events = new EventBus();
    const service = new ObservationService({
      events,
      systemObserver: new BoomSystem(),
      processObserver: new BoomProcess(),
      cacheTtlMs: 0,
    });
    const snapshot = await service.snapshot({ bypassCache: true });
    assertSnapshotShape(snapshot);
    assert(snapshot.system.availability === "error", "system error isolated");
    assert(snapshot.processes.availability === "error", "process error isolated");
    assert(snapshot.userActivity.state === "UNKNOWN", "userActivity still present");
    assert(snapshot.screen.available === false, "screen still present");
  });

  console.log("\n8) system.observe tool");
  await test("system.observe is LOW and returns snapshot via core", async () => {
    const events = new EventBus();
    const observation = new ObservationService({ events, cacheTtlMs: 50 });
    const registry = new ToolRegistry();
    registry.register(systemInfoTool);
    registry.register(createSystemObserveTool(observation));
    const core = new JarvisCore({
      registry,
      permissions: new PermissionManager(),
      tasks: new TaskManager(),
      events,
    });

    const tool = registry.get("system.observe");
    assert(tool !== undefined, "tool registered");
    assert(tool!.riskLevel === RiskLevel.LOW, "LOW");

    const result = await core.handleIntent({
      tool: "system.observe",
      arguments: {},
    });
    assert(result.permission.decision === "allow", "allow");
    assert(result.executed === true, "executed");
    assert(result.task.status === "completed", "completed");
    assertSnapshotShape(result.task.result as ObservationSnapshot);
  });

  console.log("\n9) PermissionManager");
  await test("system.observe cannot skip PermissionManager", async () => {
    const observation = new ObservationService();
    const registry = new ToolRegistry();
    registry.register(createSystemObserveTool(observation));
    const core = new JarvisCore({
      registry,
      permissions: new PermissionManager(),
      tasks: new TaskManager(),
    });
    const r = await core.handleIntent({ tool: "system.observe", arguments: {} });
    assert(r.permission.decision === "allow", "went through PM");
    assert(r.executed === true, "executed after allow");
  });

  console.log("\n10) cache");
  await test("in-memory cache avoids redundant work within TTL", async () => {
    let calls = 0;
    class CountingSystem extends SystemObserver {
      override observe(): SystemObservation {
        calls += 1;
        return super.observe();
      }
    }
    const service = new ObservationService({
      systemObserver: new CountingSystem(),
      cacheTtlMs: 5_000,
    });
    const a = await service.snapshot();
    const b = await service.snapshot();
    assert(a.timestamp === b.timestamp, "same cached snapshot");
    assert(calls === 1, `expected 1 system call, got ${calls}`);
    service.clearCache();
    await service.snapshot({ bypassCache: true });
    assert(calls === 2, "bypass refreshes");

    const cache = new ObservationCache<string>(10);
    cache.set("x");
    assert(cache.get() === "x", "cache hit");
    cache.clear();
    assert(cache.get() === null, "cleared");
  });

  console.log("\n11) EventBus");
  await test("observation_updated is emitted", async () => {
    const events = new EventBus();
    const seen: string[] = [];
    events.on("observation_updated", (p) => seen.push(p.timestamp));
    const service = new ObservationService({ events, cacheTtlMs: 0 });
    await service.snapshot({ bypassCache: true });
    assert(seen.length === 1, "emitted once");
    assert(typeof seen[0] === "string", "timestamp payload");
  });

  await test("no invented process/app/screen data", async () => {
    const snapshot = await new ObservationService().snapshot();
    assert(snapshot.processes.processes === null, "no fake processes");
    assert(snapshot.applications.applications === null, "no fake apps");
    assert(snapshot.screen.available === false, "screen false");
    assert(!("pixels" in snapshot.screen), "no pixels field abuse");
  });

  await test("unknown observe args rejected", async () => {
    const observation = new ObservationService();
    const registry = new ToolRegistry();
    registry.register(createSystemObserveTool(observation));
    const core = new JarvisCore({ registry });
    let err: unknown;
    try {
      await core.handleIntent({
        tool: "system.observe",
        arguments: { force: true },
      });
    } catch (e) {
      err = e;
    }
    assert(err instanceof JarvisCoreError, "JarvisCoreError");
  });

  console.log("\n12) observation audit");
  await test("phase 2 audit passes", async () => {
    const report = await runObservationAudit();
    assert(report.ok, report.failures.join("; ") || "audit failed");
  });

  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed.length > 0) {
    console.error("Failures:");
    for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log("All observation smoke tests passed.\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
