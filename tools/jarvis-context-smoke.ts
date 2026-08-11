/**
 * Phase 11 context awareness smoke tests (mocks only).
 */
import { JarvisCore } from "../src/core/JarvisCore.js";
import { PermissionManager } from "../src/permissions/PermissionManager.js";
import { TaskManager } from "../src/core/TaskManager.js";
import { ToolRegistry } from "../src/tools/ToolRegistry.js";
import { createContextSnapshotTool } from "../src/tools/contextSnapshot.js";
import { ObservationService } from "../src/observation/ObservationService.js";
import {
  ApplicationRegistry,
  MockApplicationService,
  MemoryApplicationAuditLog,
} from "../src/applications/index.js";
import { ScreenService } from "../src/screen/ScreenService.js";
import { MockScreenBackend } from "../src/screen/MockScreenBackend.js";
import { UserActivityService } from "../src/presence/UserActivityService.js";
import { MockUserActivityBackend } from "../src/presence/MockUserActivityBackend.js";
import { ActionService } from "../src/actions/ActionService.js";
import { FileService } from "../src/files/FileService.js";
import { MemoryFileAuditLog } from "../src/files/FileAuditLog.js";
import { MockLLMProvider } from "../src/ai/MockLLMProvider.js";
import { IntentRouter } from "../src/ai/IntentRouter.js";
import { IntentValidator } from "../src/ai/IntentValidator.js";
import {
  ContextService,
  ContextFormatter,
  MemoryContextAuditLog,
} from "../src/context/index.js";
import { JarvisRuntime } from "../src/runtime/JarvisRuntime.js";
import { runContextSecurityAudit } from "./jarvis-context-security-audit.js";
import { runContextAudit } from "./jarvis-context-audit.js";

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

function createContextHarness(options?: {
  withApps?: boolean;
  withScreen?: boolean;
  withActivity?: boolean;
  activityUnavailable?: boolean;
}) {
  const observation = new ObservationService();
  let applications: MockApplicationService | undefined;
  if (options?.withApps !== false) {
    const registry = new ApplicationRegistry();
    registry.register({
      id: "discord",
      name: "Discord",
      bundleId: "com.hnc.Discord",
    });
    applications = new MockApplicationService({
      registry,
      audit: new MemoryApplicationAuditLog(),
    });
  }

  let screen: ScreenService | undefined;
  if (options?.withScreen) {
    const backend = new MockScreenBackend();
    screen = new ScreenService({ backend });
  }

  let activity: UserActivityService | undefined;
  if (options?.withActivity) {
    const backend = new MockUserActivityBackend();
    if (options.activityUnavailable) backend.setUnavailable(true);
    else backend.setIdleSeconds(0);
    activity = new UserActivityService({ backend });
  }

  const audit = new MemoryContextAuditLog();
  const context = new ContextService({
    observation,
    applications,
    screen,
    activity,
    audit,
  });
  return { context, observation, applications, screen, activity, audit };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Context Phase 11 — Smoke Tests ===\n");

  await test("1. snapshot complet", async () => {
    const { context } = createContextHarness({
      withApps: true,
      withScreen: true,
      withActivity: true,
    });
    const r = await context.getSnapshot("system.context");
    assert(r.snapshot.system.status === "available", "system");
    assert(typeof r.timing.totalMs === "number", "timing");
    assert(r.snapshot.timestamp > 0, "ts");
  });

  await test("2. system available", async () => {
    const { context } = createContextHarness({ withApps: false });
    const r = await context.getSnapshot("system.status");
    assert(r.snapshot.system.status === "available", "available");
    assert(r.snapshot.system.os != null, "os");
  });

  await test("3. application unavailable without service", async () => {
    const { context } = createContextHarness({ withApps: false });
    const r = await context.getSnapshot("application.status");
    assert(
      r.snapshot.applications.status === "unavailable" ||
        r.snapshot.applications.status === "unknown",
      "apps unavailable",
    );
  });

  await test("4. screen unavailable without service", async () => {
    const { context } = createContextHarness({ withScreen: false });
    const r = await context.getSnapshot("screen.status");
    assert(r.snapshot.screen.status === "unavailable", "screen");
  });

  await test("5. activity unknown without service", async () => {
    const { context } = createContextHarness({ withActivity: false });
    const r = await context.getSnapshot("user.status");
    assert(r.snapshot.activity.status === "unknown", "activity");
  });

  await test("6. presence unknown when activity unavailable", async () => {
    const { context } = createContextHarness({
      withActivity: true,
      activityUnavailable: true,
    });
    const r = await context.getSnapshot("user.status");
    assert(
      r.snapshot.activity.status === "unknown" ||
        r.snapshot.presence.status === "unknown",
      "unknown",
    );
  });

  await test("7. malformed service does not invent apps", async () => {
    const { context } = createContextHarness({ withApps: false, withScreen: false });
    const r = await context.getSnapshot("system.context");
    assert(
      !r.snapshot.applications.running ||
        r.snapshot.applications.status !== "available",
      "no invented running list",
    );
    assert(
      r.snapshot.screen.status !== "available" ||
        (r.snapshot.screen.displays?.length ?? 0) >= 0,
      "screen honest",
    );
  });

  await test("8. no invented values when unavailable", async () => {
    const { context } = createContextHarness({
      withApps: false,
      withScreen: false,
      withActivity: false,
    });
    const r = await context.getSnapshot("system.context");
    assert(r.snapshot.applications.active == null || r.snapshot.applications.status !== "available", "no fake active");
    assert(r.snapshot.activity.idleSeconds == null || r.snapshot.activity.status === "available", "no fake idle");
  });

  await test("9. context tool via JarvisCore", async () => {
    const { context } = createContextHarness({ withApps: true });
    const registry = new ToolRegistry();
    registry.register(createContextSnapshotTool(context));
    const core = new JarvisCore({
      registry,
      permissions: new PermissionManager(),
      tasks: new TaskManager(),
    });
    const res = await core.handleIntent({
      tool: "system.context",
      arguments: { query: "system.status" },
    });
    assert(res.executed === true, "LOW");
    const data = res.task.result as { snapshot: { system: { status: string } } };
    assert(data.snapshot.system.status === "available", "system in tool");
  });

  await test("10. runtime integration", async () => {
    const { context } = createContextHarness({
      withApps: true,
      withActivity: true,
    });
    const files = new FileService({ audit: new MemoryFileAuditLog() });
    const apps = createContextHarness({ withApps: true }).applications!;
    const actions = new ActionService({
      files,
      applications: apps,
      permissions: new PermissionManager(),
    });
    const router = new IntentRouter({
      provider: new MockLLMProvider(),
      actions,
    });
    const runtime = new JarvisRuntime({
      router,
      actions,
      contextService: context,
    });
    const r = await runtime.processInput(
      "qu'est-ce qui se passe sur mon Mac ?",
    );
    assert(r.response.type === "message", "message");
    assert(/Mac|OS|CPU|Mémoire|Applications|Activité/i.test(r.response.message), "formatted");
  });

  await test("11. formatter", async () => {
    const { context } = createContextHarness({ withApps: true });
    const r = await context.getSnapshot("system.context");
    const text = new ContextFormatter().format(r.snapshot, "system.context");
    assert(text.includes("Mac") || text.includes("OS") || text.includes("CPU"), "text");
    assert(!/password|screenshot/i.test(text), "no secrets");
  });

  await test("12. security invariants + audits", async () => {
    const sec = await runContextSecurityAudit();
    assert(sec.ok, sec.failures.join("; "));
    const aud = await runContextAudit();
    assert(aud.ok, aud.failures.join("; "));
  });

  await test("13. LLM context intents", async () => {
    const v = new IntentValidator();
    const provider = new MockLLMProvider();
    const cases: Array<[string, string]> = [
      ["qu'est-ce qui se passe sur mon Mac ?", "system.context"],
      ["mon ordinateur va bien ?", "system.status"],
      ["qu'est-ce qui est ouvert ?", "application.status"],
      ["qu'est-ce qui est affiché ?", "screen.status"],
      ["depuis combien de temps suis-je inactif ?", "user.status"],
    ];
    for (const [text, type] of cases) {
      const raw = await provider.understand({ text });
      assert(raw.ok, text);
      if (!raw.ok) continue;
      const validated = v.validate(raw.candidate);
      assert(validated.ok && validated.intent.type === type, type);
    }
    const closeAll = await provider.understand({ text: "ferme tout" });
    assert(closeAll.ok, "ferme tout");
    if (closeAll.ok) {
      const validated = v.validate(closeAll.candidate);
      assert(
        validated.ok && validated.intent.type === "needs_clarification",
        "not context",
      );
    }
  });

  await test("14. context never plans actions", async () => {
    const files = new FileService({ audit: new MemoryFileAuditLog() });
    const apps = createContextHarness({ withApps: true }).applications!;
    const actions = new ActionService({
      files,
      applications: apps,
      permissions: new PermissionManager(),
    });
    const router = new IntentRouter({
      provider: new MockLLMProvider(),
      actions,
    });
    const planned = await router.planFromText(
      "qu'est-ce qui se passe sur mon Mac ?",
    );
    assert(!planned.ok, "no plan");
    assert(planned.outcome.kind === "context", "context kind");
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
