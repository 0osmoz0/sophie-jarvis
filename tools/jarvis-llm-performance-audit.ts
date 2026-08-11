/**
 * Phase 20 — Ollama LLM performance audit.
 * Never invents numbers. If unavailable → STATUS: UNAVAILABLE.
 * Does not log prompts, memory, or personal data.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OllamaLLMProvider } from "../src/ai/OllamaLLMProvider.js";
import { probeLLMHealth } from "../src/ai/LLMHealth.js";

const SAMPLES = Math.max(
  1,
  Math.min(10, Number(process.env.JARVIS_LLM_PERF_SAMPLES ?? "3") || 3),
);

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    average: sorted.length ? sum / sorted.length : 0,
    p50: pct(sorted, 50),
    p95: pct(sorted, 95),
    max: sorted.length ? sorted[sorted.length - 1]! : 0,
  };
}

function printBlock(title: string, values: number[]): void {
  console.log(title);
  console.log("----------");
  if (values.length === 0) {
    console.log("no samples");
    return;
  }
  const s = stats(values);
  console.log(`average: ${s.average.toFixed(1)} ms`);
  console.log(`p50:     ${s.p50.toFixed(1)} ms`);
  console.log(`p95:     ${s.p95.toFixed(1)} ms`);
  console.log(`max:     ${s.max.toFixed(1)} ms`);
  console.log(`samples: ${values.length}`);
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS LLM PERFORMANCE AUDIT — PHASE 20 ===\n");

  const health = await probeLLMHealth();
  if (health.status !== "AVAILABLE") {
    console.log("STATUS: UNAVAILABLE");
    console.log(`provider: ${health.provider}`);
    console.log(`reason: ${health.error ?? health.status}`);
    if (health.model) console.log(`model: ${health.model}`);
    if (health.endpoint) console.log(`endpoint: ${health.endpoint}`);
    console.log("\nNo invented latency figures.\n");
    return;
  }

  const provider = new OllamaLLMProvider();
  console.log("MODEL");
  console.log("-----");
  console.log(`name: ${provider.getModel()}`);
  console.log(`provider: ollama`);
  console.log(`endpoint: ${provider.getEndpoint()}`);
  console.log(`timeout: (provider default)`);
  console.log(`status: AVAILABLE`);
  console.log(`probeLatencyMs: ${health.latencyMs}`);
  console.log("");

  const understandMs: number[] = [];
  const responseMs: number[] = [];

  for (let i = 0; i < SAMPLES; i++) {
    const t0 = Date.now();
    const u = await provider.understand({
      text: "bonjour",
    });
    understandMs.push(Date.now() - t0);
    if (!u.ok) {
      console.log("STATUS: UNAVAILABLE");
      console.log(`understand failed: ${u.error}`);
      console.log("\nNo invented latency figures.\n");
      return;
    }

    const t1 = Date.now();
    const r = await provider.generateResponse({
      category: "ANSWER",
      userMessage: "bonjour",
      facts: [{ key: "greeting", value: "hello", source: "RUNTIME" }],
      fallbackText: "Bonjour.",
    });
    responseMs.push(Date.now() - t1);
    if (!r.ok) {
      console.log("(response sample failed — recorded latency only)");
    }
  }

  printBlock("UNDERSTAND", understandMs);
  console.log("");
  printBlock("RESPONSE", responseMs);
  console.log("");

  const totals = understandMs.map((u, i) => u + (responseMs[i] ?? 0));
  printBlock("TOTAL (understand+response)", totals);
  console.log("\nPrivacy: no prompts/memory/secrets logged.\n");
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
