/**
 * Phase 21 — Long session simulation (bounded growth checks).
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
  DEFAULT_CONVERSATION_WINDOW_BUDGET,
} from "../src/conversation/index.js";
import { MemoryService } from "../src/memory/MemoryService.js";
import { InMemoryMemoryStore } from "../src/memory/InMemoryMemoryStore.js";
import { MemoryRuntimeAuditLog } from "../src/runtime/RuntimeAudit.js";
import { OBSERVABILITY_LIMITS } from "../src/observability/index.js";

const CHECKPOINTS = [10, 100, 500, 1000, 5000, 10_000] as const;

async function main(): Promise<void> {
  console.log("\n=== JARVIS LONG SESSION SIMULATION — PHASE 21 ===\n");
  console.log("MODE: SIMULATION\n");

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
  const store = new InMemoryConversationStore({ maxMessages: 200 });
  const memory = new MemoryService({ store: new InMemoryMemoryStore() });
  const conversation = new ConversationService({
    store,
    memoryService: memory,
    windowBudget: DEFAULT_CONVERSATION_WINDOW_BUDGET,
  });
  const audit = new MemoryRuntimeAuditLog(1_000);
  const runtime = new JarvisRuntime({
    router: new IntentRouter({ provider, actions }),
    actions,
    responseLlm: provider,
    conversationService: conversation,
    memoryService: memory,
    audit,
  });

  let turn = 0;
  let pending = false;
  const lines: string[] = [];

  for (const n of CHECKPOINTS) {
    while (turn < n) {
      turn += 1;
      const text = pending
        ? "oui"
        : turn % 7 === 0
          ? "ouvre Safari"
          : turn % 5 === 0
            ? "ferme-le"
            : `message de session ${turn}`;
      const result = await runtime.processInput(text);
      pending = result.response.type === "confirmation_required";
    }

    const prepared = await conversation.prepareTurn("checkpoint");
    conversation.appendAssistant("ack");
    const windowChars = prepared.bundle.messages.reduce(
      (a, m) => a + m.content.length,
      0,
    );
    const stats = conversation.getStats();
    const windowOk =
      prepared.bundle.messages.length <=
      DEFAULT_CONVERSATION_WINDOW_BUDGET.maxMessages;
    const storeOk = store.count() <= 200;
    const auditOk = audit.count() <= 1_000;
    const tracesOk =
      runtime.getTraceCollector().count() <= OBSERVABILITY_LIMITS.maxTraceEntries;
    const pendingOk = runtime.getContext().getPending() == null || pending;

    lines.push(
      `n=${n} store=${store.count()} windowMessages=${prepared.bundle.messages.length} windowCharacters=${windowChars} entities=${stats.entityCount ?? "n/a"} audit=${audit.count()} traces=${runtime.getTraceCollector().count()} pendingBounded=${pendingOk} windowBounded=${windowOk} storeBounded=${storeOk} auditBounded=${auditOk} tracesBounded=${tracesOk}`,
    );

    if (!windowOk || !storeOk || !auditOk || !tracesOk) {
      console.error("UNBOUNDED GROWTH DETECTED");
      console.error(lines[lines.length - 1]);
      process.exitCode = 1;
      return;
    }
  }

  for (const line of lines) console.log(`  ${line}`);
  console.log("\nAll checkpoints bounded.");
  console.log("MODE: SIMULATION\n");
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
