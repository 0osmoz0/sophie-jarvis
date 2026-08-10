/**
 * Phase 8 controlled action execution smoke tests.
 * Uses FileService sandbox + MockApplicationService — no real Mac mutations.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JarvisCore } from "../src/core/JarvisCore.js";
import { PermissionManager } from "../src/permissions/PermissionManager.js";
import { RiskLevel } from "../src/permissions/RiskLevel.js";
import { TaskManager } from "../src/core/TaskManager.js";
import { ToolRegistry } from "../src/tools/ToolRegistry.js";
import { registerActionTools } from "../src/tools/registerActionTools.js";
import { FileService } from "../src/files/FileService.js";
import { MemoryFileAuditLog } from "../src/files/FileAuditLog.js";
import {
  ApplicationRegistry,
  MockApplicationService,
  MemoryApplicationAuditLog,
} from "../src/applications/index.js";
import {
  ActionService,
  ActionConfirmation,
  MemoryActionAuditLog,
  ACTION_ERROR_CODES,
  createBoundToken,
  type ActionPlan,
} from "../src/actions/index.js";
import { runActionExecutionAudit } from "./jarvis-action-execution-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SANDBOX = path.join(ROOT, "tools", ".tmp", "jarvis-actions", "sandbox");

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

async function resetSandbox(): Promise<void> {
  await fs.rm(path.dirname(SANDBOX), { recursive: true, force: true });
  await fs.mkdir(path.join(SANDBOX, "archive"), { recursive: true });
  await fs.writeFile(path.join(SANDBOX, "a.txt"), "alpha\n", "utf8");
  await fs.writeFile(path.join(SANDBOX, "b.txt"), "beta\n", "utf8");
}

function createHarness(options?: {
  confirmation?: ActionConfirmation;
  timeoutMs?: number;
}) {
  const fileAudit = new MemoryFileAuditLog();
  const files = new FileService({ audit: fileAudit });
  files.setAllowedPaths([SANDBOX]);

  const appRegistry = new ApplicationRegistry();
  appRegistry.register({
    id: "jarvis.test",
    name: "JarvisTestApp",
    bundleId: "com.jarvis.testapp",
  });
  const apps = new MockApplicationService({
    registry: appRegistry,
    audit: new MemoryApplicationAuditLog(),
  });

  const permissions = new PermissionManager();
  const audit = new MemoryActionAuditLog();
  const actions = new ActionService({
    files,
    applications: apps,
    permissions,
    audit,
    confirmation: options?.confirmation,
    timeoutMs: options?.timeoutMs,
  });

  const toolRegistry = new ToolRegistry();
  registerActionTools(toolRegistry, actions);
  const core = new JarvisCore({
    registry: toolRegistry,
    permissions,
    tasks: new TaskManager(),
  });

  return { actions, files, apps, audit, permissions, core };
}

async function approve(actions: ActionService, taskId: string) {
  const issued = actions.requestConfirmation(taskId);
  assert(issued.success, "issue confirmation");
  const confirmed = actions.confirm(taskId, issued.data!.token);
  assert(confirmed.success, "confirm");
  return confirmed.data!;
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Action Execution Phase 8 — Smoke Tests ===\n");
  await resetSandbox();

  console.log("1–6) plan typed actions");
  await test("plan FILE_COPY", async () => {
    const { actions } = createHarness();
    const r = actions.plan({
      type: "FILE_COPY",
      payload: {
        source: path.join(SANDBOX, "a.txt"),
        destination: path.join(SANDBOX, "archive", "a.txt"),
      },
    });
    assert(r.success && r.data!.actionType === "FILE_COPY", "type");
    assert(r.data!.status === "CONFIRMATION_REQUIRED", "confirm required");
    assert(r.data!.riskLevel === RiskLevel.MEDIUM, "MEDIUM");
  });

  await test("plan FILE_MOVE", async () => {
    const { actions } = createHarness();
    const r = actions.plan({
      type: "FILE_MOVE",
      payload: {
        source: path.join(SANDBOX, "a.txt"),
        destination: path.join(SANDBOX, "archive", "moved.txt"),
      },
    });
    assert(r.success && r.data!.actionType === "FILE_MOVE", "MOVE");
  });

  await test("plan FILE_CREATE", async () => {
    const { actions } = createHarness();
    const r = actions.plan({
      type: "FILE_CREATE",
      payload: { path: path.join(SANDBOX, "new.txt"), content: "x" },
    });
    assert(r.success && r.data!.actionType === "FILE_CREATE", "CREATE");
  });

  await test("plan FILE_DELETE", async () => {
    const { actions } = createHarness();
    const r = actions.plan({
      type: "FILE_DELETE",
      payload: { path: path.join(SANDBOX, "b.txt") },
    });
    assert(r.success && r.data!.riskLevel === RiskLevel.HIGH, "HIGH");
  });

  await test("plan APP_OPEN", async () => {
    const { actions } = createHarness();
    const r = actions.plan({
      type: "APP_OPEN",
      payload: { applicationId: "jarvis.test" },
    });
    assert(r.success && r.data!.actionType === "APP_OPEN", "OPEN");
  });

  await test("plan APP_CLOSE", async () => {
    const { actions } = createHarness();
    const r = actions.plan({
      type: "APP_CLOSE",
      payload: { applicationId: "jarvis.test" },
    });
    assert(r.success && r.data!.actionType === "APP_CLOSE", "CLOSE");
  });

  console.log("\n7) unknown action denied");
  await test("unknown action denied", async () => {
    const { actions } = createHarness();
    const r = actions.plan({
      type: "SHELL_RUN" as never,
      payload: {},
    });
    assert(!r.success && r.error?.code === ACTION_ERROR_CODES.UNKNOWN_ACTION, "denied");
  });

  console.log("\n8) malformed payload denied");
  await test("malformed payload denied", async () => {
    const { actions } = createHarness();
    const r = actions.plan({
      type: "FILE_COPY",
      payload: { source: 1 as unknown as string },
    });
    assert(!r.success && r.error?.code === ACTION_ERROR_CODES.INVALID_PAYLOAD, "invalid");
  });

  console.log("\n9) confirmation required");
  await test("execute without approve is blocked", async () => {
    const { actions } = createHarness();
    const planned = actions.plan({
      type: "APP_OPEN",
      payload: { applicationId: "jarvis.test" },
    });
    const ex = await actions.execute(planned.data!.taskId);
    assert(
      !ex.success && ex.error?.code === ACTION_ERROR_CODES.CONFIRMATION_REQUIRED,
      "blocked",
    );
  });

  console.log("\n10) confirmation token binding");
  await test("payload binding rejects mismatched token", async () => {
    const { actions } = createHarness();
    const planned = actions.plan({
      type: "FILE_DELETE",
      payload: { path: path.join(SANDBOX, "b.txt") },
    });
    const issued = actions.requestConfirmation(planned.data!.taskId);
    assert(issued.success, "issued");
    const bad = {
      ...issued.data!.token,
      payloadHash: "0".repeat(64),
    };
    const c = actions.confirm(planned.data!.taskId, bad);
    assert(!c.success && c.error?.code === ACTION_ERROR_CODES.INVALID_CONFIRMATION, "bound");
  });

  console.log("\n11) expired confirmation");
  await test("expired confirmation rejected", async () => {
    let now = 1_000_000;
    const confirmation = new ActionConfirmation({
      ttlMs: 100,
      now: () => now,
    });
    const { actions } = createHarness({ confirmation });
    const planned = actions.plan({
      type: "APP_OPEN",
      payload: { applicationId: "jarvis.test" },
    });
    const issued = actions.requestConfirmation(planned.data!.taskId);
    now = 1_000_000 + 200;
    const c = actions.confirm(planned.data!.taskId, issued.data!.token);
    assert(
      !c.success && c.error?.code === ACTION_ERROR_CODES.EXPIRED_CONFIRMATION,
      "expired",
    );
  });

  console.log("\n12) cross-task confirmation rejected");
  await test("cross-task confirmation rejected", async () => {
    const { actions } = createHarness();
    const a = actions.plan({
      type: "APP_OPEN",
      payload: { applicationId: "jarvis.test" },
    });
    const b = actions.plan({
      type: "APP_CLOSE",
      payload: { applicationId: "jarvis.test" },
    });
    const issuedA = actions.requestConfirmation(a.data!.taskId);
    actions.requestConfirmation(b.data!.taskId);
    const c = actions.confirm(b.data!.taskId, issuedA.data!.token);
    assert(
      !c.success &&
        (c.error?.code === ACTION_ERROR_CODES.CROSS_TASK_CONFIRMATION ||
          c.error?.code === ACTION_ERROR_CODES.INVALID_CONFIRMATION),
      "cross-task",
    );
  });

  console.log("\n13) execution");
  await test("approved APP_OPEN executes via mock", async () => {
    const { actions, apps } = createHarness();
    const planned = actions.plan({
      type: "APP_OPEN",
      payload: { applicationId: "jarvis.test" },
    });
    await approve(actions, planned.data!.taskId);
    const ex = await actions.execute(planned.data!.taskId);
    assert(ex.success && ex.data!.plan.status === "COMPLETED", "completed");
    const active = await apps.active();
    assert(active.success && active.data?.id === "jarvis.test", "opened");
  });

  console.log("\n14) dry-run");
  await test("dry-run FILE_COPY does not write", async () => {
    await resetSandbox();
    const { actions } = createHarness();
    const dest = path.join(SANDBOX, "archive", "dry.txt");
    const planned = actions.plan(
      {
        type: "FILE_COPY",
        payload: {
          source: path.join(SANDBOX, "a.txt"),
          destination: dest,
        },
      },
      { dryRun: true },
    );
    const ex = await actions.execute(planned.data!.taskId, { dryRun: true });
    assert(ex.success, "dry ok");
    await fs.access(dest).then(
      () => {
        throw new Error("file should not exist");
      },
      () => undefined,
    );
    assert(actions.getPlan(planned.data!.taskId)!.status !== "COMPLETED", "not completed");
  });

  console.log("\n15) idempotence");
  await test("second execute after COMPLETED denied", async () => {
    const { actions } = createHarness();
    const planned = actions.plan({
      type: "APP_OPEN",
      payload: { applicationId: "jarvis.test" },
    });
    await approve(actions, planned.data!.taskId);
    const first = await actions.execute(planned.data!.taskId);
    assert(first.success, "first");
    const second = await actions.execute(planned.data!.taskId);
    assert(
      !second.success &&
        second.error?.code === ACTION_ERROR_CODES.ALREADY_COMPLETED,
      "idempotent",
    );
  });

  console.log("\n16) cancellation");
  await test("cancel before executing", async () => {
    const { actions } = createHarness();
    const planned = actions.plan({
      type: "APP_CLOSE",
      payload: { applicationId: "jarvis.test" },
    });
    const cancelled = actions.cancel(planned.data!.taskId);
    assert(cancelled.success && cancelled.data!.status === "CANCELLED", "cancelled");
    const ex = await actions.execute(planned.data!.taskId);
    assert(!ex.success, "no execute after cancel");
  });

  console.log("\n17) timeout");
  await test("timeout yields FAILED/TIMEOUT", async () => {
    const files = new FileService({ audit: new MemoryFileAuditLog() });
    files.setAllowedPaths([SANDBOX]);
    const appRegistry = new ApplicationRegistry();
    appRegistry.register({
      id: "jarvis.test",
      name: "JarvisTestApp",
      bundleId: "com.jarvis.testapp",
    });
    const apps = new MockApplicationService({ registry: appRegistry });
    const originalOpen = apps.open.bind(apps);
    apps.open = async (args) => {
      await new Promise((r) => setTimeout(r, 200));
      return originalOpen(args);
    };
    const actions2 = new ActionService({
      files,
      applications: apps,
      permissions: new PermissionManager(),
      timeoutMs: 40,
    });
    const planned = actions2.plan({
      type: "APP_OPEN",
      payload: { applicationId: "jarvis.test" },
    });
    await approve(actions2, planned.data!.taskId);
    const ex = await actions2.execute(planned.data!.taskId, { timeoutMs: 40 });
    assert(!ex.success && ex.error?.code === ACTION_ERROR_CODES.TIMEOUT, "timeout");
    assert(actions2.getPlan(planned.data!.taskId)!.status === "FAILED", "FAILED");
  });

  console.log("\n18) audit");
  await test("audit has metadata without secrets/commands", async () => {
    const { actions, audit } = createHarness();
    const planned = actions.plan({
      type: "APP_OPEN",
      payload: { applicationId: "jarvis.test" },
    });
    await approve(actions, planned.data!.taskId);
    await actions.execute(planned.data!.taskId);
    const entries = audit.list();
    assert(entries.length >= 1, "entries");
    const json = JSON.stringify(entries);
    assert(!/password/i.test(json), "no password");
    assert(!/"command"\s*:/.test(json), "no command field");
    assert(entries.some((e) => e.actionType === "APP_OPEN"), "type logged");
  });

  console.log("\n19) PermissionManager integration");
  await test("PermissionManager gates action risk", async () => {
    const { actions, permissions } = createHarness();
    const planned = actions.plan({
      type: "FILE_DELETE",
      payload: { path: path.join(SANDBOX, "b.txt") },
    }) as { success: true; data: ActionPlan };
    const decision = actions.policy.evaluate(planned.data, permissions);
    assert(decision.decision === "require_confirmation", "needs confirm");
    const after = actions.policy.evaluate(planned.data, permissions, {
      confirmed: true,
    });
    assert(after.decision === "allow", "allow when confirmed");
  });

  console.log("\n20) rollback availability");
  await test("rollback availability reported", async () => {
    await resetSandbox();
    const { actions } = createHarness();
    const planned = actions.plan({
      type: "FILE_DELETE",
      payload: { path: path.join(SANDBOX, "b.txt") },
    });
    const info = actions.rollbackAvailability(planned.data!.taskId);
    assert(info.success && info.data!.availability === "UNSUPPORTED", "delete no rollback");
    const copy = actions.plan({
      type: "FILE_COPY",
      payload: {
        source: path.join(SANDBOX, "a.txt"),
        destination: path.join(SANDBOX, "archive", "copy.txt"),
      },
    });
    const before = actions.rollbackAvailability(copy.data!.taskId);
    assert(before.success && before.data!.availability === "UNAVAILABLE", "before exec");
  });

  console.log("\n21) CRITICAL denied");
  await test("CRITICAL always denied", async () => {
    const { actions } = createHarness();
    assert(actions.evaluateCriticalDenied() === true, "critical denied");
  });

  console.log("\n22) arbitrary command rejected");
  await test("command field and shell-like payload rejected", async () => {
    const { actions } = createHarness();
    const withCommand = actions.plan({
      type: "FILE_COPY",
      payload: {
        source: path.join(SANDBOX, "a.txt"),
        destination: path.join(SANDBOX, "archive", "a.txt"),
        command: "rm -rf /",
      } as Record<string, unknown>,
    });
    assert(
      !withCommand.success &&
        withCommand.error?.code === ACTION_ERROR_CODES.INVALID_PAYLOAD,
      "command field",
    );
    const shellLike = actions.plan({
      type: "FILE_CREATE",
      payload: {
        path: path.join(SANDBOX, "x.txt"),
        content: "hello; rm -rf /",
      },
    });
    assert(
      !shellLike.success &&
        shellLike.error?.code === ACTION_ERROR_CODES.INVALID_PAYLOAD,
      "shell meta",
    );
    const forged = createBoundToken(
      "x",
      "FILE_DELETE",
      { path: "/tmp/x" },
      Date.now() + 1000,
    );
    assert(typeof forged.payloadHash === "string", "hash helper");
  });

  console.log("\n23) tools via JarvisCore");
  await test("action.* tools respect PermissionManager", async () => {
    const { core, actions } = createHarness();
    const planResult = await core.handleIntent({
      tool: "action.plan",
      arguments: {
        type: "APP_OPEN",
        payload: { applicationId: "jarvis.test" },
      },
    });
    assert(planResult.executed === true, "plan LOW executes");
    const plan = planResult.task.result as ActionPlan;
    assert(typeof plan.taskId === "string" && plan.taskId.length > 0, "taskId");

    const issueWaiting = await core.handleIntent({
      tool: "action.confirm",
      arguments: { taskId: plan.taskId, issue: true },
    });
    assert(issueWaiting.task.status === "waiting_confirmation", "confirm MEDIUM");
    const issued = await core.confirmTask(issueWaiting.task.id, {
      taskId: issueWaiting.task.id,
      confirmed: true,
    });
    assert(issued.executed === true, "issue executed");
    const tokenPayload = issued.task.result as {
      token: Parameters<ActionService["confirm"]>[1];
    };

    const approveWaiting = await core.handleIntent({
      tool: "action.confirm",
      arguments: { taskId: plan.taskId, token: tokenPayload.token },
    });
    assert(approveWaiting.task.status === "waiting_confirmation", "approve waiting");
    const approved = await core.confirmTask(approveWaiting.task.id, {
      taskId: approveWaiting.task.id,
      confirmed: true,
    });
    assert(approved.executed === true, "approved");

    const execWaiting = await core.handleIntent({
      tool: "action.execute",
      arguments: { taskId: plan.taskId },
    });
    assert(execWaiting.task.status === "waiting_confirmation", "execute HIGH");
    const executed = await core.confirmTask(execWaiting.task.id, {
      taskId: execWaiting.task.id,
      confirmed: true,
    });
    assert(executed.executed === true, "executed");
    assert(actions.getPlan(plan.taskId)?.status === "COMPLETED", "COMPLETED");
  });

  console.log("\n24) security audit");
  await test("action execution security audit passes", async () => {
    const report = await runActionExecutionAudit();
    assert(report.ok, report.failures.join("; ") || "audit ok");
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
