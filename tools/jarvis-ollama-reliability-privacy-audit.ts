/**
 * Phase 22 — Ollama reliability privacy audit.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LLMMetrics, createLLMError } from "../src/ai/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  console.log("\n=== JARVIS Ollama Reliability — Privacy Audit ===\n");
  const failures: string[] = [];

  // Metrics dump must not contain prompt-like fields
  const metrics = new LLMMetrics();
  metrics.record({
    operation: "understand",
    ok: false,
    errorCode: "LLM_TIMEOUT",
    latencyMs: 12,
  });
  const dump = metrics.format();
  for (const bad of [
    "password",
    "apiKey",
    "prompt",
    "memory.content",
    "clipboard",
  ]) {
    if (dump.toLowerCase().includes(bad.toLowerCase())) {
      failures.push(`metrics format contains ${bad}`);
    }
  }

  const err = createLLMError({
    code: "LLM_UNKNOWN_ERROR",
    provider: "ollama",
    retryable: false,
    message: "fail password=secret token=abc",
  });
  if (/secret|token=abc/i.test(err.message)) {
    failures.push("LLMError did not sanitize secrets");
  } else {
    console.log("  · LLMError sanitizes credential-like fragments");
  }

  // Static: LLMMetrics / LLMError should not write prompts
  for (const rel of [
    "src/ai/LLMMetrics.ts",
    "src/ai/LLMError.ts",
    "src/ai/LLMCircuitBreaker.ts",
  ]) {
    const raw = await fs.readFile(path.join(ROOT, rel), "utf8");
    if (/console\.log\(.*prompt/i.test(raw)) {
      failures.push(`${rel} logs prompt`);
    }
  }
  console.log("  · metrics/error modules are metadata-oriented");

  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\n  ✓ ollama reliability privacy audit clean\n");
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
