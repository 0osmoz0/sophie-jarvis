/**
 * Phase 20 — Mock pipeline SIMULATION (5000 requests).
 * MODE: SIMULATION — not real Ollama latency.
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
import { IntentRouter } from "../src/ai/IntentRouter.js";
import { JarvisRuntime } from "../src/runtime/JarvisRuntime.js";
import {
  ConversationService,
  InMemoryConversationStore,
} from "../src/conversation/index.js";
import { MemoryService } from "../src/memory/MemoryService.js";
import { InMemoryMemoryStore } from "../src/memory/InMemoryMemoryStore.js";

const N = 5_000;

type Bucket = {
  understand: number[];
  decision: number[];
  planning: number[];
  execution: number[];
  response: number[];
  total: number[];
};

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

function makeRuntime() {
  const provider = new MockLLMProvider();
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
    store: new InMemoryConversationStore({ maxMessages: 200 }),
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

const SCENARIOS = [
  "bonjour",
  "qu'est-ce qui est ouvert ?",
  "mon Mac va bien ?",
  "quel est mon projet ?",
  "ouvre Safari",
  "ferme Safari",
  "ferme-le",
  "xyzzy unknown nonsense please clarify",
  "copie /tmp/a.txt vers /tmp/b.txt",
] as const;

async function main(): Promise<void> {
  console.log("\n=== JARVIS Pipeline Phase 20 — SIMULATION ===\n");
  console.log("MODE: SIMULATION\n");

  const runtime = makeRuntime();
  const bucket: Bucket = {
    understand: [],
    decision: [],
    planning: [],
    execution: [],
    response: [],
    total: [],
  };

  let pendingConfirm = false;
  for (let i = 0; i < N; i++) {
    const text = pendingConfirm
      ? "oui"
      : SCENARIOS[i % SCENARIOS.length]!;
    const result = await runtime.processInput(text);
    const t = result.timing;
    if (t.llmMs != null) bucket.understand.push(t.llmMs);
    if (t.decisionMs != null) bucket.decision.push(t.decisionMs);
    if (t.planningMs != null) bucket.planning.push(t.planningMs);
    if (t.executionMs != null) bucket.execution.push(t.executionMs);
    if (t.responseGenerationMs != null) {
      bucket.response.push(t.responseGenerationMs);
    }
    bucket.total.push(t.totalMs);

    if (result.response.type === "confirmation_required") {
      pendingConfirm = true;
    } else {
      pendingConfirm = false;
    }
  }

  // Conversation scale checkpoints (window bound; store allows growth for measurement)
  const store = new InMemoryConversationStore({ maxMessages: 6_000 });
  const conv = new ConversationService({
    store,
    windowBudget: { maxMessages: 12, maxCharacters: 3_000 },
  });
  const scaleLines: string[] = [];
  for (const n of [10, 100, 500, 1000, 5000]) {
    while (store.count() < n) {
      await conv.prepareTurn(`scale msg ${store.count()}`);
      conv.appendAssistant(`scale reply ${store.count()}`);
    }
    const prepared = await conv.prepareTurn("checkpoint");
    const chars = prepared.bundle.messages.reduce(
      (a, m) => a + m.content.length,
      0,
    );
    scaleLines.push(
      `n=${n} store=${store.count()} windowMessages=${prepared.bundle.messages.length} windowCharacters=${chars} windowBounded=yes`,
    );
  }

  const print = (label: string, values: number[]) => {
    const s = stats(values);
    console.log(label);
    console.log(`  average: ${s.average.toFixed(3)} ms`);
    console.log(`  p50:     ${s.p50.toFixed(3)} ms`);
    console.log(`  p95:     ${s.p95.toFixed(3)} ms`);
    console.log(`  max:     ${s.max.toFixed(3)} ms`);
    console.log(`  samples: ${values.length}`);
  };

  console.log(`requests: ${N}`);
  print("UNDERSTAND", bucket.understand);
  print("DECISION", bucket.decision);
  print("PLANNING", bucket.planning);
  print("EXECUTION", bucket.execution);
  print("RESPONSE", bucket.response);
  print("TOTAL", bucket.total);

  console.log("\nCONVERSATION SCALE (window bound)");
  for (const line of scaleLines) console.log(`  ${line}`);

  console.log("\nMODE: SIMULATION");
  console.log("(MockLLMProvider — not real Ollama latency)\n");
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
