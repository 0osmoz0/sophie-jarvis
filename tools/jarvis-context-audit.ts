/**
 * Phase 11 context privacy / consistency audit.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ObservationService } from "../src/observation/ObservationService.js";
import { ContextService, MemoryContextAuditLog } from "../src/context/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface ContextAuditReport {
  ok: boolean;
  failures: string[];
  notes: string[];
}

export async function runContextAudit(): Promise<ContextAuditReport> {
  const failures: string[] = [];
  const notes: string[] = [];

  const auditLog = new MemoryContextAuditLog();
  const service = new ContextService({
    observation: new ObservationService(),
    audit: auditLog,
  });
  const result = await service.getSnapshot("system.context");
  const snap = result.snapshot;

  if (!snap.timestamp || typeof snap.timestamp !== "number") {
    failures.push("snapshot missing timestamp");
  }
  for (const domain of [
    "system",
    "applications",
    "screen",
    "activity",
    "presence",
    "files",
  ] as const) {
    if (!snap[domain]?.status) {
      failures.push(`${domain} missing status`);
    }
  }

  if (
    snap.applications.status !== "available" &&
    Array.isArray(snap.applications.running) &&
    snap.applications.running.length > 0
  ) {
    failures.push("invented running apps while unavailable");
  }

  const entries = auditLog.list();
  if (entries.length < 1) failures.push("audit not recorded");
  const json = JSON.stringify(entries);
  if (/password|screenshot|clipboard|keycode/i.test(json)) {
    failures.push("sensitive data in context audit");
  }

  const src = await fs.readFile(
    path.join(ROOT, "src/context/ContextService.ts"),
    "utf8",
  );
  if (/\.execute\(|ActionExecutor|requestConfirmation/.test(src)) {
    failures.push("ContextService must not trigger actions");
  }

  notes.push("Context audit: domain statuses + metadata only.");
  notes.push("Context never stores screenshots / passwords / key content.");

  return { ok: failures.length === 0, failures, notes };
}

const isDirect =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  runContextAudit().then((report) => {
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) console.log("Context audit PASSED.");
    else {
      console.error("Context audit FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
