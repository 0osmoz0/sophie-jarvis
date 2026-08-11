import { JarvisCore } from "../src/core/JarvisCore.js";
import { PermissionManager } from "../src/permissions/PermissionManager.js";
import { RiskLevel } from "../src/permissions/RiskLevel.js";
import { TaskManager } from "../src/core/TaskManager.js";
import { ToolRegistry } from "../src/tools/ToolRegistry.js";
import { registerApplicationTools } from "../src/tools/registerApplicationTools.js";
import { ApplicationRegistry } from "../src/applications/ApplicationRegistry.js";
import { ApplicationResolver } from "../src/applications/ApplicationResolver.js";
import { ApplicationPolicy } from "../src/applications/ApplicationPolicy.js";
import {
  ApplicationService,
  MockApplicationService,
} from "../src/applications/ApplicationService.js";
import { MemoryApplicationAuditLog } from "../src/applications/ApplicationAuditLog.js";
import {
  APPLICATION_ERROR_CODES,
  DENIED_SYSTEM_APPLICATIONS,
} from "../src/applications/types.js";
import { runApplicationControlAudit } from "./jarvis-application-control-audit.js";

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

function seedRegistry(registry: ApplicationRegistry): void {
  registry.register({
    id: "jarvis.test",
    name: "JarvisTestApp",
    bundleId: "com.jarvis.testapp",
    path: "/Applications/JarvisTestApp.app",
    aliases: ["test app"],
  });
  registry.register({
    id: "jarvis.chrome.mock",
    name: "Google Chrome",
    bundleId: "com.google.Chrome",
    path: "/Applications/Google Chrome.app",
    aliases: ["chrome"],
  });
  registry.register({
    id: "system.finder",
    name: "Finder",
    bundleId: "com.apple.finder",
    path: "/System/Library/CoreServices/Finder.app",
  });
}

function createMockHarness() {
  const audit = new MemoryApplicationAuditLog();
  const registry = new ApplicationRegistry();
  seedRegistry(registry);
  const apps = new MockApplicationService({ registry, audit });
  const toolRegistry = new ToolRegistry();
  registerApplicationTools(toolRegistry, apps);
  const core = new JarvisCore({
    registry: toolRegistry,
    permissions: new PermissionManager(),
    tasks: new TaskManager(),
  });
  return { apps, audit, registry, core, toolRegistry };
}

async function confirmAndRun(
  core: JarvisCore,
  tool: string,
  args: Record<string, unknown>,
) {
  const waiting = await core.handleIntent({ tool, arguments: args });
  assert(
    waiting.task.status === "waiting_confirmation",
    `expected waiting_confirmation, got ${waiting.task.status}`,
  );
  assert(waiting.executed === false, "not executed before confirm");
  return core.confirmTask(waiting.task.id, {
    taskId: waiting.task.id,
    confirmed: true,
  });
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Application Control Phase 4 — Smoke Tests ===\n");
  console.log(
    "Note: open/close tests use MockApplicationService (safe). System tests are opt-in and still unavailable without a native backend.\n",
  );

  if (process.env.JARVIS_APP_SYSTEM_TESTS === "1") {
    console.log("JARVIS_APP_SYSTEM_TESTS=1 — checking default service returns unavailable for open");
    const real = new ApplicationService();
    real.registry.register({
      id: "optin",
      name: "JarvisTestApp",
      bundleId: "com.jarvis.testapp",
    });
    const open = await real.open({ name: "JarvisTestApp", confirmed: true });
    assert(open.success === false, "system open unavailable");
    assert(
      !open.success && open.error.code === APPLICATION_ERROR_CODES.UNAVAILABLE,
      "UNAVAILABLE",
    );
  }

  console.log("1) ApplicationResolver");
  await test("resolves known name and rejects command injection", () => {
    const registry = new ApplicationRegistry();
    seedRegistry(registry);
    const resolver = new ApplicationResolver(registry);
    const ok = resolver.resolve({ kind: "name", value: "Google Chrome" });
    assert(ok.ok === true, "chrome ok");
    const bad = resolver.resolve({
      kind: "name",
      value: "Google Chrome && rm -rf /",
    });
    assert(bad.ok === false, "injection rejected");
    assert(!bad.ok && bad.code === APPLICATION_ERROR_CODES.INVALID_INPUT, "INVALID_INPUT");
  });

  console.log("\n2) ApplicationRegistry");
  await test("register / list / find", () => {
    const registry = new ApplicationRegistry();
    seedRegistry(registry);
    assert(registry.list().length === 3, "3 apps");
    assert(registry.findByName("chrome")?.name === "Google Chrome", "alias");
    assert(registry.findByBundleId("com.jarvis.testapp")?.id === "jarvis.test", "bundle");
  });

  console.log("\n3) ApplicationPolicy");
  await test("denylist blocks Finder close/open", () => {
    const policy = new ApplicationPolicy();
    const registry = new ApplicationRegistry();
    seedRegistry(registry);
    const finder = registry.findByName("Finder")!;
    const close = policy.evaluate("close", finder);
    assert(close.allowed === false, "close denied");
    assert(close.code === APPLICATION_ERROR_CODES.DENYLIST, "DENYLIST");
    const open = policy.evaluate("open", finder);
    assert(open.allowed === false, "open denied");
    assert(policy.getDenylistNames().includes("Finder"), "list contains Finder");
    assert(DENIED_SYSTEM_APPLICATIONS.includes("Dock"), "Dock denylisted");
    const blocked = policy.isBlockedPath("/System/Applications/Foo.app");
    assert(blocked === true, "system path blocked");
  });

  console.log("\n4) application.list");
  await test("lists registry apps via core", async () => {
    const { core } = createMockHarness();
    const r = await core.handleIntent({ tool: "application.list", arguments: {} });
    assert(r.permission.decision === "allow", "LOW");
    assert(r.executed === true, "executed");
    const data = r.task.result as { applications: Array<{ name: string }> };
    assert(data.applications.some((a) => a.name === "JarvisTestApp"), "test app");
  });

  console.log("\n5) application.info");
  await test("info for registered app", async () => {
    const { core } = createMockHarness();
    const r = await core.handleIntent({
      tool: "application.info",
      arguments: { name: "JarvisTestApp" },
    });
    assert(r.task.status === "completed", "completed");
    const data = r.task.result as { name: string; bundleId: string | null };
    assert(data.name === "JarvisTestApp", "name");
    assert(data.bundleId === "com.jarvis.testapp", "bundle");
  });

  console.log("\n6) application.active");
  await test("mock active returns null then app after open", async () => {
    const { core, apps } = createMockHarness();
    const before = await core.handleIntent({
      tool: "application.active",
      arguments: {},
    });
    assert(before.task.status === "completed", "completed");
    assert(before.task.result === null, "no active");

    await confirmAndRun(core, "application.open", { name: "JarvisTestApp" });
    const after = await apps.active();
    assert(after.success === true && after.data?.name === "JarvisTestApp", "active set");
  });

  console.log("\n7) application.open");
  await test("open with confirmation (mock)", async () => {
    const { core } = createMockHarness();
    const r = await confirmAndRun(core, "application.open", {
      name: "JarvisTestApp",
    });
    assert(r.executed === true, "executed");
    assert(r.task.status === "completed", "completed");
    const data = r.task.result as { running: boolean };
    assert(data.running === true, "running");
  });

  console.log("\n8) application.close");
  await test("close with confirmation (mock)", async () => {
    const { core, apps } = createMockHarness();
    apps.mockSetRunning("jarvis.test", true);
    const r = await confirmAndRun(core, "application.close", {
      name: "JarvisTestApp",
    });
    assert(r.task.status === "completed", "completed");
    const data = r.task.result as { running: boolean };
    assert(data.running === false, "stopped");
  });

  console.log("\n9) PermissionManager");
  await test("risk levels", () => {
    const { toolRegistry } = createMockHarness();
    assert(toolRegistry.get("application.list")!.riskLevel === RiskLevel.LOW, "list");
    assert(toolRegistry.get("application.info")!.riskLevel === RiskLevel.LOW, "info");
    assert(toolRegistry.get("application.active")!.riskLevel === RiskLevel.LOW, "active");
    assert(toolRegistry.get("application.open")!.riskLevel === RiskLevel.MEDIUM, "open");
    assert(toolRegistry.get("application.close")!.riskLevel === RiskLevel.MEDIUM, "close");
  });

  console.log("\n10) denylist");
  await test("cannot close Finder even after confirmation path", async () => {
    const { core } = createMockHarness();
    const waiting = await core.handleIntent({
      tool: "application.close",
      arguments: { name: "Finder" },
    });
    assert(waiting.task.status === "waiting_confirmation", "needs confirm first");
    const done = await core.confirmTask(waiting.task.id, {
      taskId: waiting.task.id,
      confirmed: true,
    });
    // Tool executes but ApplicationPolicy/Service denies → failed
    assert(done.executed === true, "ran after confirm");
    assert(done.task.status === "failed", "failed due to denylist");
  });

  console.log("\n11) confirmation");
  await test("open without confirmation does not execute", async () => {
    const { core } = createMockHarness();
    const waiting = await core.handleIntent({
      tool: "application.open",
      arguments: { name: "JarvisTestApp" },
    });
    assert(waiting.executed === false, "not executed");
    assert(waiting.permission.decision === "require_confirmation", "confirm");
  });

  await test("chrome confirmation does not authorize terminal-like other app without its own task", async () => {
    const { core, apps } = createMockHarness();
    const chromeWait = await core.handleIntent({
      tool: "application.open",
      arguments: { name: "Google Chrome" },
    });
    // Confirm chrome only
    await core.confirmTask(chromeWait.task.id, {
      taskId: chromeWait.task.id,
      confirmed: true,
    });
    // JarvisTestApp still needs its own confirmation
    const other = await core.handleIntent({
      tool: "application.open",
      arguments: { name: "JarvisTestApp" },
    });
    assert(other.task.status === "waiting_confirmation", "separate confirmation");
    assert(apps.registry.get("jarvis.test") !== undefined, "still registered");
  });

  console.log("\n12) invalid application");
  await test("unknown app fails", async () => {
    const { core } = createMockHarness();
    const r = await core.handleIntent({
      tool: "application.info",
      arguments: { name: "NotARealAppXYZ" },
    });
    assert(r.task.status === "failed", "failed");
  });

  console.log("\n13) malformed input");
  await test("command-like name rejected", async () => {
    const { apps } = createMockHarness();
    const r = await apps.open({
      name: "Google Chrome && rm -rf /tmp",
      confirmed: true,
    });
    assert(r.success === false, "rejected");
    assert(
      !r.success &&
        (r.error.code === APPLICATION_ERROR_CODES.INVALID_INPUT ||
          r.error.code === APPLICATION_ERROR_CODES.INVALID_IDENTITY),
      "INVALID_IDENTITY",
    );
  });

  console.log("\n14) audit log");
  await test("audit without window contents", async () => {
    const { apps, audit } = createMockHarness();
    await apps.list();
    await apps.open({ name: "JarvisTestApp", confirmed: true });
    const entries = audit.list();
    assert(entries.length >= 2, "entries");
    for (const e of entries) {
      assert(!("windowContent" in e), "no window content");
      assert(!("typedText" in e), "no typed text");
    }
  });

  console.log("\n15) no shell / default unavailable");
  await test("default ApplicationService open/close unavailable", async () => {
    const registry = new ApplicationRegistry();
    seedRegistry(registry);
    // Force honest UNAVAILABLE path (Phase 13 may load a real addon by default).
    const { MacOSApplicationBackend } = await import(
      "../src/platform/macos/MacOSApplicationBackend.js"
    );
    const svc = new ApplicationService({
      registry,
      backend: new MacOSApplicationBackend({ skipNativeLoad: true }),
    });
    const open = await svc.open({ name: "JarvisTestApp", confirmed: true });
    assert(open.success === false, "open unavailable");
    assert(
      !open.success && open.error.code === APPLICATION_ERROR_CODES.UNAVAILABLE,
      "code",
    );
    const close = await svc.close({ name: "JarvisTestApp", confirmed: true });
    assert(close.success === false, "close unavailable");
  });

  console.log("\n16) no automation / audit");
  await test("phase 4 security audit passes", async () => {
    const report = await runApplicationControlAudit();
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
    console.log("All application-control smoke tests passed.\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
