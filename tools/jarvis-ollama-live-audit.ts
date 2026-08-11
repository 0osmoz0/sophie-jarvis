/**
 * Phase 22 — Live Ollama audit (real provider only if available).
 * Never invents numbers. If unavailable → STATUS: UNAVAILABLE.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OllamaLLMProvider, probeLLMHealth } from "../src/ai/index.js";

async function main(): Promise<void> {
  console.log("\n=== JARVIS OLLAMA LIVE AUDIT — PHASE 22 ===\n");

  const health = await probeLLMHealth();
  if (health.status !== "AVAILABLE") {
    console.log("STATUS: UNAVAILABLE");
    console.log(`reason: ${health.error ?? health.status}`);
    if (health.model) console.log(`model: ${health.model}`);
    if (health.endpoint) console.log(`endpoint: ${health.endpoint}`);
    console.log("\nNo invented live results.\n");
    return;
  }

  const provider = new OllamaLLMProvider();
  console.log("STATUS: AVAILABLE");
  console.log(`provider: ollama`);
  console.log(`model: ${provider.getModel()}`);
  console.log(`endpoint: ${provider.getEndpoint()}`);
  console.log(`timeouts: ${JSON.stringify(provider.getTimeoutPolicy())}`);
  console.log("");

  const t0 = Date.now();
  const u = await provider.understand({ text: "bonjour" });
  console.log("UNDERSTAND");
  console.log(`  ok: ${u.ok}`);
  console.log(`  latencyMs: ${Date.now() - t0}`);
  if (!u.ok) {
    console.log(`  errorCode: ${u.errorCode ?? u.status}`);
  } else {
    console.log(`  attempt: ${u.attempt ?? 1}`);
  }

  const t1 = Date.now();
  const g = await provider.generateResponse({
    userMessage: "bonjour",
    category: "ANSWER",
    fallbackText: "Bonjour.",
    facts: [{ key: "greeting", value: "hello", source: "RUNTIME" }],
  });
  console.log("GENERATE_RESPONSE");
  console.log(`  ok: ${g.ok}`);
  console.log(`  latencyMs: ${Date.now() - t1}`);
  if (!g.ok) console.log(`  errorCode: ${g.errorCode ?? g.status}`);

  // Invalid output handling via injected second call not needed — live status only
  console.log("RUNTIME_STATUS");
  console.log(JSON.stringify(provider.getRuntimeStatus(), null, 2));
  console.log("\nPrivacy: no prompts/responses logged.\n");
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
