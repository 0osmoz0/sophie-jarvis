/**
 * Phase 12 Sophie integration smoke tests (mocks only).
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
import { ObservationService } from "../src/observation/ObservationService.js";
import { ContextService } from "../src/context/ContextService.js";
import { JarvisRuntime } from "../src/runtime/JarvisRuntime.js";
import {
  SophieAPI,
  SophieEventBus,
  SophieIntegration,
} from "../src/integration/index.js";
import { runIntegrationSecurityAudit } from "./jarvis-integration-security-audit.js";
import { runIntegrationContractTests } from "./integration-contract-test.js";

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

function createStack() {
  const integration = new SophieIntegration({
    getRuntimeState: () => "IDLE",
  });
  const api = new SophieAPI(integration);
  const context = new ContextService({
    observation: new ObservationService(),
    sophieSignals: () => integration.getContextSignals(),
  });
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
  const router = new IntentRouter({
    provider: new MockLLMProvider(),
    actions,
  });
  const runtime = new JarvisRuntime({
    router,
    actions,
    contextService: context,
    sophieIntegration: integration,
  });
  return { integration, api, context, actions, runtime };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Sophie Integration Phase 12 — Smoke Tests ===\n");

  await test("1. EventBus emit", () => {
    const bus = new SophieEventBus();
    let seen = false;
    bus.subscribe("pet", () => {
      seen = true;
    });
    bus.emit({ type: "pet", timestamp: Date.now() });
    assert(seen, "listener");
  });

  await test("2. subscribe", () => {
    const bus = new SophieEventBus();
    const fn = () => {};
    bus.subscribe("wave", fn);
    assert(bus.listenerCount("wave") === 1, "count");
  });

  await test("3. unsubscribe", () => {
    const bus = new SophieEventBus();
    const fn = () => {};
    bus.subscribe("wave", fn);
    bus.unsubscribe("wave", fn);
    assert(bus.listenerCount("wave") === 0, "removed");
  });

  await test("4. typed payload validation", () => {
    const { api } = createStack();
    const r = api.emit({ type: "pet", payload: {} });
    assert(r.ok, "pet ok");
  });

  await test("5. malformed event", () => {
    const { api } = createStack();
    const r = api.emit("pet");
    assert(!r.ok, "reject string");
  });

  await test("6. forbidden payload", () => {
    const { api } = createStack();
    const r = api.emit({
      type: "pet",
      payload: { command: "rm -rf /" },
    });
    assert(!r.ok, "forbidden");
  });

  await test("7. SophieIntegration", () => {
    const { integration } = createStack();
    const r = integration.handleInput({ type: "user_idle" });
    assert(r.ok, "idle");
    assert(
      integration.memory.lastUserSignal?.type === "user_idle",
      "memory",
    );
  });

  await test("8. Context update", async () => {
    const { api, context } = createStack();
    api.emit({ type: "music_started", payload: {} });
    const snap = await context.getSnapshot("system.context");
    assert(snap.snapshot.sophie?.lastMediaEvent?.type === "music_started", "media");
  });

  await test("9. Memory update", () => {
    const { api, integration } = createStack();
    api.emit({ type: "love" });
    assert(
      integration.memory.lastSophieInteraction?.type === "love",
      "love",
    );
  });

  await test("10. outbound events", () => {
    const { api, integration } = createStack();
    const outbound: string[] = [];
    api.subscribe("behavior_started", (e) => {
      outbound.push(e.type);
    });
    api.subscribe("user_interaction", (e) => {
      outbound.push(e.type);
    });
    api.emit({ type: "pet" });
    integration.notifyBehaviorStarted("greet");
    assert(outbound.includes("user_interaction"), "interaction");
    assert(outbound.includes("behavior_started"), "behavior");
  });

  await test("11. snapshot", () => {
    const { api } = createStack();
    api.emit({ type: "pet" });
    const snap = api.getSnapshot();
    assert(snap.state === "IDLE", "state");
    assert(snap.personality.lastInteraction === "pet", "personality");
    assert(!("ActionExecutor" in snap), "no executor");
  });

  await test("12. runtime integration", () => {
    const { runtime, integration } = createStack();
    const r = runtime.receiveSophieEvent({ type: "wave" });
    assert(r.ok, "runtime");
    assert(
      integration.memory.lastSophieInteraction?.type === "wave",
      "wave",
    );
  });

  await test("13. no direct action", () => {
    const { api } = createStack();
    // SophieAPI must not expose control methods
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(api));
    assert(!proto.includes("execute"), "no execute");
    assert(!proto.includes("runCommand"), "no runCommand");
    assert(!proto.includes("shell"), "no shell");
    assert(!proto.includes("performAction"), "no performAction");
    const r = api.emit({ type: "music_started" });
    assert(r.ok, "signal ok without action");
  });

  await test("14. no direct animation", () => {
    const { api } = createStack();
    const r = api.emit({
      type: "pet",
      animationOverride: "dance",
    } as unknown);
    assert(!r.ok, "no animation override");
  });

  await test("15. security invariants + contract", async () => {
    const sec = await runIntegrationSecurityAudit();
    assert(sec.ok, sec.failures.join("; "));
    const contract = await runIntegrationContractTests();
    assert(contract.ok, contract.failures.join("; "));
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
