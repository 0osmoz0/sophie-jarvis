/**
 * Phase 10 runtime session audit helper (metadata scan / privacy checks).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryRuntimeAuditLog } from "../src/runtime/RuntimeAudit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface RuntimeAuditToolReport {
  ok: boolean;
  failures: string[];
  notes: string[];
}

export async function runRuntimeAuditTool(): Promise<RuntimeAuditToolReport> {
  const failures: string[] = [];
  const notes: string[] = [];

  const auditSrc = await fs.readFile(
    path.join(ROOT, "src/runtime/RuntimeAudit.ts"),
    "utf8",
  );
  if (/password|screenshot|clipboard/i.test(auditSrc)) {
    failures.push("RuntimeAudit must not reference sensitive content fields");
  }

  const log = new MemoryRuntimeAuditLog();
  log.append({
    timestamp: new Date().toISOString(),
    interactionId: "ix_test",
    intentType: "conversation",
    planStatus: null,
    risk: null,
    confirmationStatus: null,
    executionStatus: null,
    resultCode: "OK",
    latencyMs: 1,
    state: "IDLE",
  });
  const json = JSON.stringify(log.list());
  if (/password|secret/i.test(json)) {
    failures.push("audit entry contained forbidden words");
  }

  notes.push("Runtime audit stores metadata only (no file contents / secrets).");
  return { ok: failures.length === 0, failures, notes };
}

const isDirect =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  runRuntimeAuditTool().then((report) => {
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) {
      console.log("Runtime audit tool PASSED.");
    } else {
      console.error("Runtime audit tool FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
