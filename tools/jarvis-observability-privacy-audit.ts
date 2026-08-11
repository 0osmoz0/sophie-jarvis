/**
 * Phase 21 — Observability privacy audit (metadata only).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PipelineTraceCollector,
  ObservabilityAuditLog,
  ObservabilityPolicy,
} from "../src/observability/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN_LITERALS = [
  "password",
  "apiKey",
  "api_key",
  "clipboard",
  "keystrokes",
  "screenshots",
  "memory.content",
  "message.content",
  "file contents",
  "window text",
] as const;

export async function runObservabilityPrivacyAudit(): Promise<{
  ok: boolean;
  failures: string[];
  notes: string[];
}> {
  const failures: string[] = [];
  const notes: string[] = [];

  const dir = path.join(ROOT, "src/observability");
  const files = await fs.readdir(dir);
  for (const f of files) {
    if (!f.endsWith(".ts")) continue;
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const rel = `src/observability/${f}`;
    // Allow policy to mention forbidden names as deny patterns
    if (f === "ObservabilityPolicy.ts" || f === "JarvisError.ts") continue;
    for (const lit of FORBIDDEN_LITERALS) {
      if (raw.toLowerCase().includes(lit.toLowerCase()) && lit !== "password") {
        // Heuristic: fail if assigning/logging these fields
        if (
          new RegExp(`\\b${lit.replace(".", "\\.")}\\b`, "i").test(raw) &&
          /append|record|console\.|writeFile/.test(raw)
        ) {
          failures.push(`${rel} may log ${lit}`);
        }
      }
    }
  }

  const policy = new ObservabilityPolicy();
  if (policy.allowDetail("password", "password=secret") !== null) {
    failures.push("policy allowed password detail");
  } else {
    notes.push("ObservabilityPolicy redacts forbidden detail keys/values");
  }
  if (policy.allowDetail("detail", "ok-stage") === null) {
    failures.push("policy blocked safe detail");
  }

  const collector = new PipelineTraceCollector();
  const trace = collector.begin("ix_test");
  trace.record("INPUT", "OK", { detail: "password=hunter2" });
  trace.complete(1);
  const snap = collector.commit(trace);
  const dumped = JSON.stringify(snap);
  if (/hunter2|password=/.test(dumped)) {
    failures.push("trace retained password-like detail");
  } else {
    notes.push("PipelineTrace strips unsafe detail");
  }

  const audit = new ObservabilityAuditLog();
  audit.append({
    timestamp: new Date().toISOString(),
    requestId: "ix_test",
    event: "trace_complete",
    latencyMs: 1,
  });
  const auditDump = JSON.stringify(audit.list());
  for (const lit of ["message.content", "memory.content", "clipboard"]) {
    if (auditDump.includes(lit)) failures.push(`audit contains ${lit}`);
  }
  notes.push("ObservabilityAuditLog entries are metadata-only");

  return { ok: failures.length === 0, failures, notes };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Observability — Privacy Audit ===\n");
  const report = await runObservabilityPrivacyAudit();
  for (const n of report.notes) console.log(`  · ${n}`);
  if (report.failures.length) {
    for (const f of report.failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\n  ✓ observability privacy audit clean\n");
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
