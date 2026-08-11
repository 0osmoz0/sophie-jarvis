/**
 * Phase 20 — Pipeline security audit.
 * Ensures optimizations never create LLM→Executor / Response→Permission shortcuts.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPipelineAudit } from "./jarvis-pipeline-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface PipelineSecurityAuditReport {
  ok: boolean;
  failures: string[];
  notes: string[];
}

function stripCommentsAndStrings(source: string): string {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  out = out.replace(/(^|[^:])\/\/.*$/gm, "$1");
  out = out.replace(/`(?:\\.|[^`\\])*`/g, '""');
  out = out.replace(/"(?:\\.|[^"\\])*"/g, '""');
  out = out.replace(/'(?:\\.|[^'\\])*'/g, '""');
  return out;
}

async function read(rel: string): Promise<string> {
  return fs.readFile(path.join(ROOT, rel), "utf8");
}

export async function runPipelineSecurityAudit(): Promise<PipelineSecurityAuditReport> {
  const failures: string[] = [];
  const notes: string[] = [];

  // RequestPipelineContext must not import executor/permission
  const pipeCtx = await read("src/runtime/RequestPipelineContext.ts");
  for (const bad of [
    "ActionExecutor",
    "PermissionManager",
    "ActionConfirmation",
    "ActionPermissionPolicy",
  ]) {
    if (pipeCtx.includes(bad)) {
      failures.push(`RequestPipelineContext references ${bad}`);
    }
  }
  notes.push("RequestPipelineContext has no auth/exec imports");

  // Response module must not execute
  const responseDir = path.join(ROOT, "src/response");
  const respFiles = await fs.readdir(responseDir);
  for (const f of respFiles) {
    if (!f.endsWith(".ts")) continue;
    const raw = await fs.readFile(path.join(responseDir, f), "utf8");
    const code = stripCommentsAndStrings(raw);
    if (/\bActionExecutor\b/.test(code)) {
      failures.push(`response/${f} references ActionExecutor`);
    }
    if (/\bPermissionManager\b/.test(code)) {
      failures.push(`response/${f} references PermissionManager`);
    }
  }
  notes.push("response/ does not reference Executor/PermissionManager");

  // IntentRouter: planFromOutcome must not call provider.understand
  const router = await read("src/ai/IntentRouter.ts");
  const planFromOutcomeBlock = router.slice(
    router.indexOf("planFromOutcome("),
    router.indexOf("private ") > 0
      ? router.indexOf("classifyIntent", router.indexOf("planFromOutcome("))
      : router.length,
  );
  if (/this\.provider\.understand/.test(planFromOutcomeBlock)) {
    failures.push("planFromOutcome still calls provider.understand");
  } else {
    notes.push("planFromOutcome does not re-call LLM");
  }

  // Runtime still uses planFromOutcome (not planFromText) on action path
  const runtime = await read("src/runtime/JarvisRuntime.ts");
  if (!/planFromOutcome\(outcome\)/.test(runtime)) {
    failures.push("JarvisRuntime missing planFromOutcome(outcome)");
  } else {
    notes.push("runtime action path uses planFromOutcome");
  }
  // Ensure no direct executor from response generator usage path
  if (/responseGenerator\.[\s\S]{0,80}ActionExecutor/.test(runtime)) {
    failures.push("runtime wires ResponseGenerator to ActionExecutor");
  }

  // Forbidden capability markers in pipeline docs/tools
  for (const rel of [
    "docs/JARVIS_PIPELINE.md",
    "src/runtime/RequestPipelineContext.ts",
  ]) {
    let raw: string;
    try {
      raw = await read(rel);
    } catch {
      continue;
    }
    if (/\bBehaviorBrain\b/.test(raw)) {
      failures.push(`${rel} mentions BehaviorBrain`);
    }
  }

  const behavioral = await runPipelineAudit();
  if (!behavioral.ok) {
    failures.push(...behavioral.failures.map((f) => `behavioral: ${f}`));
  } else {
    notes.push("behavioral pipeline audit clean");
  }

  notes.push(
    "Boundaries: LLM interprets → Decision evaluates → Policy authorizes → Executor acts → Response explains",
  );

  return { ok: failures.length === 0, failures, notes };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Pipeline Phase 20 — Security Audit ===\n");
  const report = await runPipelineSecurityAudit();
  for (const n of report.notes) console.log(`  · ${n}`);
  if (report.failures.length) {
    console.log("\nFailures:");
    for (const f of report.failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\n  ✓ pipeline security audit clean\n");
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
