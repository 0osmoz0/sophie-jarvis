import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EventBus } from "../src/core/EventBus.js";
import { JarvisCore } from "../src/core/JarvisCore.js";
import { PermissionManager } from "../src/permissions/PermissionManager.js";
import { RiskLevel } from "../src/permissions/RiskLevel.js";
import { TaskManager } from "../src/core/TaskManager.js";
import { ToolRegistry } from "../src/tools/ToolRegistry.js";
import { registerFileTools } from "../src/tools/registerFileTools.js";
import { FileService } from "../src/files/FileService.js";
import { MemoryFileAuditLog } from "../src/files/FileAuditLog.js";
import { FILE_ERROR_CODES } from "../src/files/types.js";
import type { DryRunPlan } from "../src/files/types.js";
import { runFileControlAudit } from "./jarvis-file-control-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SANDBOX = path.join(ROOT, "tools", ".tmp", "jarvis-files", "sandbox");

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
  await fs.writeFile(path.join(SANDBOX, "hello.txt"), "hello\n", "utf8");
  await fs.writeFile(path.join(SANDBOX, "test.txt"), "test\n", "utf8");
}

function createHarness(extraAllowed: string[] = []) {
  const audit = new MemoryFileAuditLog();
  const files = new FileService({ audit });
  files.setAllowedPaths([SANDBOX, ...extraAllowed]);
  const registry = new ToolRegistry();
  registerFileTools(registry, files);
  const events = new EventBus();
  const core = new JarvisCore({
    registry,
    permissions: new PermissionManager(),
    tasks: new TaskManager(),
    events,
  });
  return { files, audit, registry, core, events };
}

async function confirmAndRun(
  core: JarvisCore,
  tool: string,
  args: Record<string, unknown>,
) {
  const waiting = await core.handleIntent({ tool, arguments: args });
  assert(
    waiting.task.status === "waiting_confirmation",
    `expected waiting_confirmation for ${tool}, got ${waiting.task.status}`,
  );
  assert(waiting.executed === false, "must not execute before confirm");
  return core.confirmTask(waiting.task.id, {
    taskId: waiting.task.id,
    confirmed: true,
  });
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS File Control Phase 3 — Smoke Tests ===\n");
  await resetSandbox();

  console.log("1) file.list");
  await test("lists allowed directory entries", async () => {
    const { core } = createHarness();
    const r = await core.handleIntent({
      tool: "file.list",
      arguments: { path: SANDBOX },
    });
    assert(r.executed === true, "executed");
    assert(r.permission.decision === "allow", "LOW allow");
    const data = r.task.result as { entries: Array<{ name: string }> };
    const names = data.entries.map((e) => e.name).sort();
    assert(names.includes("hello.txt"), "hello.txt");
    assert(names.includes("test.txt"), "test.txt");
    assert(names.includes("archive"), "archive");
  });

  console.log("\n2) file.info");
  await test("returns metadata without reading content", async () => {
    const { core } = createHarness();
    const r = await core.handleIntent({
      tool: "file.info",
      arguments: { path: path.join(SANDBOX, "hello.txt") },
    });
    assert(r.executed === true, "executed");
    const data = r.task.result as {
      name: string;
      extension: string | null;
      size: number;
    };
    assert(data.name === "hello.txt", "name");
    assert(data.extension === ".txt", "ext");
    assert(typeof data.size === "number", "size");
  });

  console.log("\n3) file.copy");
  await test("copy with confirmation", async () => {
    await resetSandbox();
    const { core } = createHarness();
    const dest = path.join(SANDBOX, "archive", "hello-copy.txt");
    const r = await confirmAndRun(core, "file.copy", {
      source: path.join(SANDBOX, "hello.txt"),
      destination: dest,
    });
    assert(r.executed === true, "executed");
    assert(r.task.status === "completed", "completed");
    const body = await fs.readFile(dest, "utf8");
    assert(body === "hello\n", "copied content");
  });

  console.log("\n4) file.move");
  await test("move with confirmation", async () => {
    await resetSandbox();
    const { core } = createHarness();
    const src = path.join(SANDBOX, "test.txt");
    const dest = path.join(SANDBOX, "archive", "test-moved.txt");
    const r = await confirmAndRun(core, "file.move", {
      source: src,
      destination: dest,
    });
    assert(r.task.status === "completed", "completed");
    await fs.access(dest);
    let gone = false;
    try {
      await fs.access(src);
    } catch {
      gone = true;
    }
    assert(gone, "source removed");
  });

  console.log("\n5) file.create");
  await test("create text file with confirmation", async () => {
    await resetSandbox();
    const { core } = createHarness();
    const target = path.join(SANDBOX, "note.txt");
    const r = await confirmAndRun(core, "file.create", {
      path: target,
      content: "bonjour",
    });
    assert(r.task.status === "completed", "completed");
    assert((await fs.readFile(target, "utf8")) === "bonjour", "content");
  });

  console.log("\n6) file.delete");
  await test("delete file with confirmation", async () => {
    await resetSandbox();
    const { core } = createHarness();
    const target = path.join(SANDBOX, "hello.txt");
    const r = await confirmAndRun(core, "file.delete", { path: target });
    assert(r.task.status === "completed", "completed");
    let gone = false;
    try {
      await fs.access(target);
    } catch {
      gone = true;
    }
    assert(gone, "deleted");
  });

  console.log("\n7) PermissionManager");
  await test("risk levels for file tools", () => {
    const { registry } = createHarness();
    assert(registry.get("file.list")!.riskLevel === RiskLevel.LOW, "list LOW");
    assert(registry.get("file.info")!.riskLevel === RiskLevel.LOW, "info LOW");
    assert(registry.get("file.copy")!.riskLevel === RiskLevel.MEDIUM, "copy MEDIUM");
    assert(registry.get("file.move")!.riskLevel === RiskLevel.MEDIUM, "move MEDIUM");
    assert(registry.get("file.create")!.riskLevel === RiskLevel.MEDIUM, "create MEDIUM");
    assert(registry.get("file.delete")!.riskLevel === RiskLevel.HIGH, "delete HIGH");
  });

  console.log("\n8) FilePolicy");
  await test("default deny and setAllowedPaths", async () => {
    const files = new FileService();
    const denied = await files.list({ path: SANDBOX });
    assert(denied.success === false, "default deny");
    files.setAllowedPaths([SANDBOX]);
    const ok = await files.list({ path: SANDBOX });
    assert(ok.success === true, "allowed after set");
  });

  console.log("\n9) path traversal");
  await test("../ and ../../ denied", async () => {
    const { files } = createHarness();
    const a = await files.list({ path: path.join(SANDBOX, "..") });
    assert(a.success === false, ".. denied");
    const b = await files.info({
      path: path.join(SANDBOX, "..", "..", "package.json"),
    });
    assert(b.success === false, "../../ denied");
    const encoded = await files.info({
      path: path.join(SANDBOX, "%2e%2e%2f%2e%2e%2fpackage.json"),
    });
    assert(encoded.success === false, "urlencoded traversal denied");
  });

  console.log("\n10) symlink escape");
  await test("symlink pointing outside sandbox is denied", async () => {
    await resetSandbox();
    const link = path.join(SANDBOX, "escape-link");
    const outside = path.join(os.tmpdir(), `jarvis-outside-${process.pid}.txt`);
    await fs.writeFile(outside, "secret", "utf8");
    try {
      await fs.symlink(outside, link);
    } catch {
      // Some environments block symlink creation — skip softly
      console.log("  (symlink creation unavailable — asserting policy on absolute outside)");
      const { files } = createHarness();
      const r = await files.info({ path: outside });
      assert(r.success === false, "absolute outside denied");
      return;
    }
    const { files } = createHarness();
    const info = await files.info({ path: link });
    assert(info.success === false, "symlink escape denied");
    assert(
      !info.success &&
        (info.error.code === FILE_ERROR_CODES.SYMLINK_ESCAPE ||
          info.error.code === FILE_ERROR_CODES.DENIED),
      "symlink error code",
    );
    await fs.unlink(outside).catch(() => undefined);
  });

  console.log("\n11) collision handling");
  await test("overwrite without explicit option denied", async () => {
    await resetSandbox();
    const { files } = createHarness();
    const r = await files.copy({
      source: path.join(SANDBOX, "hello.txt"),
      destination: path.join(SANDBOX, "test.txt"),
      confirmed: true,
    });
    assert(r.success === false, "collision denied");
    assert(!r.success && r.error.code === FILE_ERROR_CODES.EXISTS, "EXISTS");
  });

  console.log("\n12) dryRun");
  await test("dryRun produces plan without mutation", async () => {
    await resetSandbox();
    const { files } = createHarness();
    const dest = path.join(SANDBOX, "archive", "dry.txt");
    const planResult = await files.copy({
      source: path.join(SANDBOX, "hello.txt"),
      destination: dest,
      dryRun: true,
    });
    assert(planResult.success === true, "dry ok");
    if (!planResult.success) throw new Error("unreachable");
    const plan = planResult.data as DryRunPlan;
    assert(plan.operation === "copy", "op");
    assert(plan.requiresConfirmation === true, "needs confirm");
    assert(plan.riskLevel === RiskLevel.MEDIUM, "medium");
    let exists = true;
    try {
      await fs.access(dest);
    } catch {
      exists = false;
    }
    assert(!exists, "no file created");
  });

  console.log("\n13) confirmation");
  await test("delete without confirmation does not execute", async () => {
    await resetSandbox();
    const { core } = createHarness();
    const target = path.join(SANDBOX, "hello.txt");
    const waiting = await core.handleIntent({
      tool: "file.delete",
      arguments: { path: target },
    });
    assert(waiting.permission.decision === "require_confirmation", "needs confirm");
    assert(waiting.executed === false, "not executed");
    await fs.access(target); // still exists
  });

  await test("confirmation is bound to a single task", async () => {
    await resetSandbox();
    const { core } = createHarness();
    const w1 = await core.handleIntent({
      tool: "file.delete",
      arguments: { path: path.join(SANDBOX, "hello.txt") },
    });
    const w2 = await core.handleIntent({
      tool: "file.delete",
      arguments: { path: path.join(SANDBOX, "test.txt") },
    });
    // Confirming w1 with w2's token must fail
    let threw = false;
    try {
      await core.confirmTask(w1.task.id, {
        taskId: w2.task.id,
        confirmed: true,
      });
    } catch {
      threw = true;
    }
    assert(threw, "cross-task confirmation rejected");
    await fs.access(path.join(SANDBOX, "hello.txt"));
  });

  console.log("\n14) audit log");
  await test("audit records operations without file contents", async () => {
    await resetSandbox();
    const { files, audit } = createHarness();
    await files.list({ path: SANDBOX });
    await files.copy({
      source: path.join(SANDBOX, "hello.txt"),
      destination: path.join(SANDBOX, "archive", "a.txt"),
      confirmed: true,
    });
    const entries = audit.list();
    assert(entries.length >= 2, "entries present");
    for (const e of entries) {
      assert(!("content" in e), "no content field");
      assert(typeof e.timestamp === "string", "timestamp");
      assert(typeof e.toolId === "string", "toolId");
    }
  });

  console.log("\n15) error handling / forbidden cases");
  await test("absolute outside sandbox denied", async () => {
    const { files } = createHarness();
    const r = await files.info({ path: "/etc/hosts" });
    assert(r.success === false, "denied");
  });

  await test("directory delete denied", async () => {
    const { files } = createHarness();
    const r = await files.delete({
      path: path.join(SANDBOX, "archive"),
      confirmed: true,
    });
    assert(r.success === false, "dir delete denied");
    assert(!r.success && r.error.code === FILE_ERROR_CODES.IS_DIRECTORY, "IS_DIRECTORY");
  });

  await test("recursive delete denied", async () => {
    const { files } = createHarness();
    const r = await files.delete({
      path: path.join(SANDBOX, "hello.txt"),
      recursive: true,
      confirmed: true,
    });
    assert(r.success === false, "recursive denied");
    assert(!r.success && r.error.code === FILE_ERROR_CODES.UNSUPPORTED, "UNSUPPORTED");
  });

  await test("blocked path ~/Library style denied", async () => {
    const { files } = createHarness();
    // Even if mistakenly allowed, blocked prefixes win — try home Library
    files.setAllowedPaths([path.join(os.homedir(), "Library")]);
    const r = await files.list({ path: path.join(os.homedir(), "Library") });
    assert(r.success === false, "blocked");
  });

  await test("script create denied", async () => {
    await resetSandbox();
    const { files } = createHarness();
    const r = await files.create({
      path: path.join(SANDBOX, "run.sh"),
      content: "echo hi",
      confirmed: true,
    });
    assert(r.success === false, "script denied");
  });

  await test("forbidden path via core tool", async () => {
    const { core } = createHarness();
    const r = await core.handleIntent({
      tool: "file.list",
      arguments: { path: "/System" },
    });
    assert(r.executed === true, "LOW still runs tool");
    assert(r.task.status === "failed" || r.task.result === null || true, "handled");
    // Tool returns ok:false → JarvisCore marks failed
    assert(r.task.status === "failed", "failed status");
  });

  console.log("\n16) file-control audit");
  await test("phase 3 audit passes", async () => {
    const report = await runFileControlAudit();
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
    console.log("All file-control smoke tests passed.\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
