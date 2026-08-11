/**
 * Phase 23 — Voice privacy audit.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VoiceAuditLog, VoiceMetrics } from "../src/voice/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  console.log("\n=== JARVIS Voice — Privacy Audit ===\n");
  const failures: string[] = [];

  const audit = new VoiceAuditLog();
  audit.append({
    timestamp: new Date().toISOString(),
    voiceRequestId: "vx_test",
    requestId: "ix_test",
    event: "stt_complete",
    transcriptChars: 12,
    confidenceBucket: "high",
    latencyMs: 10,
  });
  const dump = JSON.stringify(audit.list());
  for (const bad of [
    "password",
    "ouvre Safari",
    "audio/",
    "microphone buffer",
    "Uint8Array",
    "memory.content",
  ]) {
    if (dump.includes(bad)) failures.push(`audit contains ${bad}`);
  }
  console.log("  · VoiceAuditLog stores metadata only (chars/buckets)");

  const metrics = new VoiceMetrics();
  metrics.record({ sttOk: true, ttsFallback: true });
  const m = metrics.format();
  if (/prompt|transcript=|password/i.test(m)) {
    failures.push("metrics leak content");
  } else {
    console.log("  · VoiceMetrics metadata-only");
  }

  const auditSrc = await fs.readFile(
    path.join(ROOT, "src/voice/VoiceAuditLog.ts"),
    "utf8",
  );
  if (/transcriptText|audioBuffer|\bpcm\b|\.wav\b/i.test(auditSrc)) {
    failures.push("VoiceAuditLog declares sensitive fields");
  }

  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\n  ✓ voice privacy audit clean\n");
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
