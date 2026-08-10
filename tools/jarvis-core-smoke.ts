import { ToolRegistry } from "../src/tools/ToolRegistry.js";
import { systemInfoTool } from "../src/tools/systemInfo.js";
import { PermissionManager } from "../src/permissions/PermissionManager.js";
import { RiskLevel } from "../src/permissions/RiskLevel.js";
import { TaskManager } from "../src/core/TaskManager.js";
import { EventBus } from "../src/core/EventBus.js";
import { Context } from "../src/core/Context.js";
import { JarvisCore, JarvisCoreError } from "../src/core/JarvisCore.js";
import { MockAIProvider } from "../src/intelligence/MockAIProvider.js";
import {
  NullSophieBridge,
  createSophieBridgeMessage,
} from "../src/integration/SophieBridge.js";
import type { Tool } from "../src/tools/Tool.js";
import { runSecurityInvariants } from "./security-invariants.js";

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

function stubTool(
  id: string,
  riskLevel: RiskLevel,
  executeFn?: Tool["execute"],
): Tool {
  let executed = false;
  const tool: Tool & { wasExecuted: () => boolean } = {
    id,
    name: id,
    description: `Stub ${id}`,
    riskLevel,
    execute: executeFn
      ? async (args) => {
          executed = true;
          return executeFn(args);
        }
      : async () => {
          executed = true;
          return { ok: true, data: { stub: id } };
        },
    wasExecuted: () => executed,
  };
  return tool;
}

function createCore(extraTools: Tool[] = []): {
  core: JarvisCore;
  registry: ToolRegistry;
  events: EventBus;
  bridge: NullSophieBridge;
} {
  const registry = new ToolRegistry();
  registry.register(systemInfoTool);
  for (const t of extraTools) registry.register(t);
  const events = new EventBus();
  const bridge = new NullSophieBridge();
  const core = new JarvisCore({
    registry,
    permissions: new PermissionManager(),
    tasks: new TaskManager(),
    events,
    context: new Context(),
    sophieBridge: bridge,
  });
  return { core, registry, events, bridge };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Core Phase 1 — Smoke Tests ===\n");

  console.log("1) ToolRegistry");
  await test("register / get / list / unregister", () => {
    const registry = new ToolRegistry();
    registry.register(systemInfoTool);
    assert(registry.get("system.info") === systemInfoTool, "get failed");
    assert(registry.list().length === 1, "list length");
    assert(registry.unregister("system.info") === true, "unregister");
    assert(registry.get("system.info") === undefined, "after unregister");
  });

  await test("reject malformed tool", () => {
    const registry = new ToolRegistry();
    let threw = false;
    try {
      registry.register({} as Tool);
    } catch {
      threw = true;
    }
    assert(threw, "expected malformed registration to throw");
  });

  console.log("\n2) system.info");
  await test("system.info returns metadata without shell", async () => {
    const { core } = createCore();
    const result = await core.handleIntent({ tool: "system.info", arguments: {} });
    assert(result.executed === true, "should execute");
    assert(result.task.status === "completed", "completed");
    assert(result.permission.decision === "allow", "LOW allow");
    const data = result.task.result as {
      platform: string;
      arch: string;
      jarvisVersion: string;
      timestamp: string;
      hostname: string | null;
    };
    assert(typeof data.platform === "string", "platform");
    assert(typeof data.arch === "string", "arch");
    assert(data.jarvisVersion === "0.4.0", "version");
    assert(typeof data.timestamp === "string", "timestamp");
  });

  console.log("\n3) PermissionManager");
  await test("LOW → allow", () => {
    const pm = new PermissionManager();
    const d = pm.evaluate({
      toolId: "system.info",
      riskLevel: RiskLevel.LOW,
      arguments: {},
      taskId: "t1",
    });
    assert(d.decision === "allow", "expected allow");
  });

  await test("MEDIUM → require_confirmation", () => {
    const pm = new PermissionManager();
    const d = pm.evaluate({
      toolId: "medium.stub",
      riskLevel: RiskLevel.MEDIUM,
      arguments: {},
      taskId: "t2",
    });
    assert(d.decision === "require_confirmation", "expected confirmation");
  });

  await test("HIGH → require_confirmation", () => {
    const pm = new PermissionManager();
    const d = pm.evaluate({
      toolId: "high.stub",
      riskLevel: RiskLevel.HIGH,
      arguments: {},
      taskId: "t3",
    });
    assert(d.decision === "require_confirmation", "expected confirmation");
  });

  await test("CRITICAL → deny", () => {
    const pm = new PermissionManager();
    const d = pm.evaluate({
      toolId: "critical.stub",
      riskLevel: RiskLevel.CRITICAL,
      arguments: {},
      taskId: "t4",
    });
    assert(d.decision === "deny", "expected deny");
  });

  console.log("\n4) TaskManager");
  await test("task transitions are coherent", () => {
    const tm = new TaskManager();
    const task = tm.create({
      description: "test",
      toolId: "system.info",
      riskLevel: RiskLevel.LOW,
    });
    assert(task.status === "pending", "pending");
    const running = tm.markRunning(task.id);
    assert(running.status === "running", "running");
    assert(running.startedAt !== null, "startedAt");
    const completed = tm.markCompleted(task.id, { ok: true });
    assert(completed.status === "completed", "completed");
    assert(completed.completedAt !== null, "completedAt");

    const t2 = tm.create({
      description: "wait",
      toolId: "x",
      riskLevel: RiskLevel.MEDIUM,
    });
    tm.markWaitingConfirmation(t2.id);
    assert(tm.get(t2.id)?.status === "waiting_confirmation", "waiting");
    tm.markCancelled(t2.id);
    assert(tm.get(t2.id)?.status === "cancelled", "cancelled");

    const t3 = tm.create({
      description: "fail",
      toolId: "x",
      riskLevel: RiskLevel.LOW,
    });
    tm.markRunning(t3.id);
    tm.markFailed(t3.id, "boom");
    assert(tm.get(t3.id)?.status === "failed", "failed");
  });

  await test("invalid transition throws", () => {
    const tm = new TaskManager();
    const task = tm.create({
      description: "x",
      toolId: "x",
      riskLevel: RiskLevel.LOW,
    });
    tm.markRunning(task.id);
    tm.markCompleted(task.id, {});
    let threw = false;
    try {
      tm.markFailed(task.id, "nope");
    } catch {
      threw = true;
    }
    assert(threw, "expected invalid transition to throw");
  });

  console.log("\n5) EventBus");
  await test("EventBus emits task lifecycle events", async () => {
    const { core, events } = createCore();
    const seen: string[] = [];
    events.on("task_created", () => seen.push("task_created"));
    events.on("task_started", () => seen.push("task_started"));
    events.on("task_completed", () => seen.push("task_completed"));
    await core.handleIntent({ tool: "system.info", arguments: {} });
    assert(seen.includes("task_created"), "created");
    assert(seen.includes("task_started"), "started");
    assert(seen.includes("task_completed"), "completed");
  });

  console.log("\n6) JarvisCore");
  await test("LOW tool → authorized execution", async () => {
    const { core } = createCore();
    const r = await core.handleIntent({ tool: "system.info", arguments: {} });
    assert(r.permission.decision === "allow", "allow");
    assert(r.executed === true, "executed");
    assert(r.task.status === "completed", "completed");
  });

  await test("MEDIUM tool → confirmation required, not executed", async () => {
    const medium = stubTool("medium.demo", RiskLevel.MEDIUM) as Tool & {
      wasExecuted: () => boolean;
    };
    const { core } = createCore([medium]);
    const r = await core.handleIntent({ tool: "medium.demo", arguments: {} });
    assert(r.permission.decision === "require_confirmation", "confirm");
    assert(r.executed === false, "not executed");
    assert(r.task.status === "waiting_confirmation", "waiting");
    assert(medium.wasExecuted() === false, "tool not called");
  });

  await test("HIGH tool → confirmation required", async () => {
    const high = stubTool("high.demo", RiskLevel.HIGH) as Tool & {
      wasExecuted: () => boolean;
    };
    const { core } = createCore([high]);
    const r = await core.handleIntent({ tool: "high.demo", arguments: {} });
    assert(r.permission.decision === "require_confirmation", "confirm");
    assert(r.executed === false, "not executed");
    assert(high.wasExecuted() === false, "tool not called");
  });

  await test("CRITICAL tool → automatic refuse", async () => {
    const critical = stubTool("critical.demo", RiskLevel.CRITICAL) as Tool & {
      wasExecuted: () => boolean;
    };
    const { core } = createCore([critical]);
    const r = await core.handleIntent({ tool: "critical.demo", arguments: {} });
    assert(r.permission.decision === "deny", "deny");
    assert(r.executed === false, "not executed");
    assert(r.task.status === "failed", "failed");
    assert(critical.wasExecuted() === false, "tool not called");
  });

  await test("unknown tool → controlled error", async () => {
    const { core } = createCore();
    let err: unknown;
    try {
      await core.handleIntent({ tool: "does.not.exist", arguments: {} });
    } catch (e) {
      err = e;
    }
    assert(err instanceof JarvisCoreError, "JarvisCoreError");
    assert((err as JarvisCoreError).code === "UNKNOWN_TOOL", "code");
  });

  await test("malformed intent → controlled error", async () => {
    const { core } = createCore();
    let err: unknown;
    try {
      await core.handleIntent({ tool: "", arguments: {} });
    } catch (e) {
      err = e;
    }
    assert(err instanceof JarvisCoreError, "JarvisCoreError");
    assert((err as JarvisCoreError).code === "MALFORMED_INTENT", "code");
  });

  await test("no tool can bypass PermissionManager", async () => {
    const bypassAttempts: string[] = [];
    const sneaky: Tool = {
      id: "sneaky.medium",
      name: "Sneaky",
      description: "Tries to look low but is medium",
      riskLevel: RiskLevel.MEDIUM,
      execute: async () => {
        bypassAttempts.push("executed");
        return { ok: true, data: {} };
      },
    };
    const { core } = createCore([sneaky]);
    const r = await core.handleIntent({ tool: "sneaky.medium", arguments: {} });
    assert(r.executed === false, "must not execute");
    assert(bypassAttempts.length === 0, "execute must not be called");
    assert(r.task.status === "waiting_confirmation", "waiting");
  });

  await test("MEDIUM after confirmTask → executes", async () => {
    const medium = stubTool("medium.confirm", RiskLevel.MEDIUM) as Tool & {
      wasExecuted: () => boolean;
    };
    const { core } = createCore([medium]);
    const waiting = await core.handleIntent({
      tool: "medium.confirm",
      arguments: {},
    });
    assert(waiting.task.status === "waiting_confirmation", "waiting");
    const confirmed = await core.confirmTask(waiting.task.id, {
      taskId: waiting.task.id,
      confirmed: true,
    });
    assert(confirmed.executed === true, "executed after confirm");
    assert(confirmed.task.status === "completed", "completed");
    assert(medium.wasExecuted() === true, "tool ran");
  });

  console.log("\n7) MockAIProvider");
  await test("MockAIProvider cannot execute a Tool directly", async () => {
    const ai = new MockAIProvider();
    const gen = await ai.generate({ prompt: "show system info" });
    assert(gen.proposedIntent?.tool === "system.info", "proposes intent");
    // Provider has no execute / registry / shell — only proposes.
    assert(
      !("execute" in ai) || typeof (ai as { execute?: unknown }).execute !== "function",
      "no execute on provider",
    );
    const analyze = await ai.analyze({ input: { a: 1 } });
    assert(typeof analyze.summary === "string", "analyze");
    const classify = await ai.classify({
      input: "x",
      labels: ["safe", "unsafe"],
    });
    assert(classify.label === "safe", "classify first label");
  });

  await test("proposed Intent still goes through JarvisCore", async () => {
    const ai = new MockAIProvider();
    const { core } = createCore();
    const gen = await ai.generate({ prompt: "system info please" });
    assert(gen.proposedIntent !== undefined, "has intent");
    const r = await core.handleIntent(gen.proposedIntent!);
    assert(r.task.status === "completed", "core executed safely");
  });

  console.log("\n8) SophieBridge");
  await test("NullSophieBridge records without Sophie dependency", async () => {
    const bridge = new NullSophieBridge();
    assert(bridge.isConnected() === false, "not connected");
    bridge.notify(
      createSophieBridgeMessage("status", { phase: 1 }),
    );
    assert(bridge.sent.length === 1, "recorded");
    assert(bridge.sent[0]?.type === "status", "type");

    const { core, bridge: coreBridge } = createCore();
    await core.handleIntent({ tool: "system.info", arguments: {} });
    assert(coreBridge.sent.length >= 1, "core notified bridge");
  });

  console.log("\n9) Security invariants");
  await test("source tree has no dangerous capabilities", async () => {
    const report = await runSecurityInvariants();
    assert(report.ok, report.failures.join("; ") || "invariants failed");
  });

  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed.length > 0) {
    console.error("Failures:");
    for (const f of failed) {
      console.error(`  - ${f.name}: ${f.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log("All smoke tests passed.\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
