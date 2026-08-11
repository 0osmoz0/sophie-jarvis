/**
 * Phase 20 — Real interaction benchmark (mock or ollama).
 *
 *   JARVIS_LLM_PROVIDER=mock npx tsx tools/jarvis-interaction-benchmark.ts
 *   JARVIS_LLM_PROVIDER=ollama npx tsx tools/jarvis-interaction-benchmark.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PermissionManager } from "../src/permissions/PermissionManager.js";
import { FileService } from "../src/files/FileService.js";
import { MemoryFileAuditLog } from "../src/files/FileAuditLog.js";
import {
  ApplicationRegistry,
  MockApplicationService,
  MemoryApplicationAuditLog,
} from "../src/applications/index.js";
import { ActionService } from "../src/actions/ActionService.js";
import { ActionConfirmation } from "../src/actions/ActionConfirmation.js";
import { MockLLMProvider } from "../src/ai/MockLLMProvider.js";
import { OllamaLLMProvider } from "../src/ai/OllamaLLMProvider.js";
import type { LLMProvider } from "../src/ai/LLMProvider.js";
import { IntentRouter } from "../src/ai/IntentRouter.js";
import { JarvisRuntime, formatTiming } from "../src/runtime/JarvisRuntime.js";
import {
  ConversationService,
  InMemoryConversationStore,
} from "../src/conversation/index.js";
import { MemoryService } from "../src/memory/MemoryService.js";
import { InMemoryMemoryStore } from "../src/memory/InMemoryMemoryStore.js";
import { probeLLMHealth } from "../src/ai/LLMHealth.js";

const SCRIPT = [
  "bonjour",
  "qu'est-ce qui est ouvert ?",
  "ouvre Safari",
  // confirmation handled dynamically
  "ferme-le",
  "qu'est-ce qui est ouvert ?",
  "mon Mac va bien ?",
] as const;

function makeRuntime(provider: LLMProvider) {
  const files = new FileService({ audit: new MemoryFileAuditLog() });
  const registry = new ApplicationRegistry();
  registry.register({
    id: "safari",
    name: "Safari",
    bundleId: "com.apple.Safari",
  });
  const apps = new MockApplicationService({
    registry,
    audit: new MemoryApplicationAuditLog(),
  });
  const actions = new ActionService({
    files,
    applications: apps,
    permissions: new PermissionManager(),
    confirmation: new ActionConfirmation({ ttlMs: 60_000 }),
  });
  const memory = new MemoryService({ store: new InMemoryMemoryStore() });
  const conversation = new ConversationService({
    store: new InMemoryConversationStore(),
    memoryService: memory,
  });
  return new JarvisRuntime({
    router: new IntentRouter({ provider, actions }),
    actions,
    responseLlm: provider,
    conversationService: conversation,
    memoryService: memory,
  });
}

async function resolveProvider(): Promise<{
  name: string;
  provider: LLMProvider;
} | null> {
  const pref = (process.env.JARVIS_LLM_PROVIDER ?? "mock").toLowerCase();
  if (pref === "ollama") {
    const health = await probeLLMHealth();
    if (health.status !== "AVAILABLE") {
      console.log("STATUS: UNAVAILABLE");
      console.log(`reason: ${health.error ?? health.status}`);
      console.log("Set JARVIS_LLM_PROVIDER=mock for mock benchmark.\n");
      return null;
    }
    return { name: "ollama", provider: new OllamaLLMProvider() };
  }
  return { name: "mock", provider: new MockLLMProvider() };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS INTERACTION BENCHMARK — PHASE 20 ===\n");

  const resolved = await resolveProvider();
  if (!resolved) {
    process.exitCode = 0;
    return;
  }

  console.log(`PROVIDER: ${resolved.name}`);
  console.log("MODE: REAL INTERACTION (runtime processInput)\n");

  const runtime = makeRuntime(resolved.provider);
  let turn = 0;

  for (const line of SCRIPT) {
    turn += 1;
    console.log(`--- TURN ${turn}: ${JSON.stringify(line)} ---`);
    const result = await runtime.processInput(line);
    const msg = result.response.message;
    console.log(`state: ${result.state}`);
    console.log(`responseType: ${result.response.type}`);
    console.log(`preview: ${String(msg).slice(0, 120)}`);
    console.log(
      `understandCalls: ${result.timing.llmUnderstandCalls ?? 0} responseCalls: ${result.timing.llmResponseCalls ?? 0}`,
    );
    console.log(formatTiming(result.timing));
    console.log("");

    if (result.response.type === "confirmation_required") {
      turn += 1;
      console.log(`--- TURN ${turn}: "oui" (confirmation) ---`);
      const conf = await runtime.processInput("oui");
      const cmsg = conf.response.message;
      console.log(`state: ${conf.state}`);
      console.log(`responseType: ${conf.response.type}`);
      console.log(`preview: ${String(cmsg).slice(0, 120)}`);
      console.log(
        `understandCalls: ${conf.timing.llmUnderstandCalls ?? 0} responseCalls: ${conf.timing.llmResponseCalls ?? 0}`,
      );
      console.log(formatTiming(conf.timing));
      console.log("");
    }
  }

  console.log("DONE.\n");
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
