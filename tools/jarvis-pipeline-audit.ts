/**
 * Phase 20 — Pipeline audit (behavioral + single-pass + timing).
 */
import path from "node:path";
import fs from "node:fs/promises";
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
import {
  JarvisRuntime,
  classifyLatency,
  formatPipelineTiming,
} from "../src/runtime/JarvisRuntime.js";
import {
  ConversationService,
  InMemoryConversationStore,
} from "../src/conversation/index.js";
import { MemoryService } from "../src/memory/MemoryService.js";
import { InMemoryMemoryStore } from "../src/memory/InMemoryMemoryStore.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface PipelineAuditReport {
  ok: boolean;
  failures: string[];
  notes: string[];
}

function makeRuntime(provider = new MockLLMProvider()) {
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

export async function runPipelineAudit(): Promise<PipelineAuditReport> {
  const failures: string[] = [];
  const notes: string[] = [];

  // Single-pass understand on action path
  const provider = new MockLLMProvider();
  let understandCalls = 0;
  const origU = provider.understand.bind(provider);
  provider.understand = async (req) => {
    understandCalls += 1;
    return origU(req);
  };
  let responseCalls = 0;
  const origR = provider.generateResponse.bind(provider);
  provider.generateResponse = async (req) => {
    responseCalls += 1;
    return origR(req);
  };

  const runtime = makeRuntime(provider);
  understandCalls = 0;
  responseCalls = 0;
  const open = await runtime.processInput("ouvre Safari");
  if (understandCalls !== 1) {
    failures.push(`action path understand calls=${understandCalls} (want 1)`);
  } else {
    notes.push("single-pass understand on action planning path");
  }
  if ((open.timing.llmUnderstandCalls ?? 0) !== 1) {
    failures.push(
      `timing.llmUnderstandCalls=${open.timing.llmUnderstandCalls}`,
    );
  }
  if (!open.pipeline) {
    failures.push("missing RequestPipelineContext on result");
  } else {
    notes.push("RequestPipelineContext attached");
    notes.push(`latency class: ${open.pipeline.latencyClass}`);
  }

  // Confirm then execute — response generation once per narrated turn
  responseCalls = 0;
  const confirm = await runtime.processInput("oui");
  if (responseCalls > 1) {
    failures.push(`confirm turn generateResponse calls=${responseCalls}`);
  } else {
    notes.push(`confirm turn generateResponse calls=${responseCalls}`);
  }
  if (confirm.response.type === "executed") {
    notes.push("execution path returns executed (not silent)");
  }

  // Memory skip on action
  const open2 = await runtime.processInput("ouvre Safari");
  if (open2.timing.memoryRecallSkipped !== true) {
    failures.push("memory recall should skip on 'ouvre Safari'");
  } else {
    notes.push("memoryRecallSkipped on action command");
  }

  // Greeting
  const hello = await runtime.processInput("bonjour");
  if ((hello.timing.llmUnderstandCalls ?? 0) !== 1) {
    failures.push("greeting understand count != 1");
  }
  const cls = classifyLatency(hello.timing.totalMs);
  notes.push(`greeting latency class=${cls} totalMs=${hello.timing.totalMs.toFixed(2)}`);
  notes.push("formatTiming sample:\n" + formatPipelineTiming({
    conversationMs: hello.timing.conversationMs ?? null,
    referenceResolutionMs: hello.timing.referenceResolutionMs ?? null,
    memoryRecallMs: hello.timing.memoryRecallMs ?? null,
    llmUnderstandMs: hello.timing.llmMs,
    validationMs: hello.timing.validationMs,
    decisionMs: hello.timing.decisionMs ?? null,
    planningMs: hello.timing.planningMs,
    permissionMs: null,
    confirmationMs: hello.timing.confirmationMs,
    executionMs: hello.timing.executionMs,
    contextMs: hello.timing.contextMs ?? null,
    llmResponseMs: hello.timing.responseGenerationMs ?? null,
    responseValidationMs: null,
    totalMs: hello.timing.totalMs,
    llmUnderstandCalls: hello.timing.llmUnderstandCalls ?? 0,
    llmResponseCalls: hello.timing.llmResponseCalls ?? 0,
    memoryRecallUsed: hello.timing.memoryRecallUsed === true,
    memoryRecallSkipped: hello.timing.memoryRecallSkipped === true,
  }));

  // Error propagation: clarification / no invent success
  const unclear = await runtime.processInput("ferme-le");
  const unclearText =
    unclear.response.type === "clarification" ||
    unclear.response.type === "message" ||
    unclear.response.type === "error"
      ? ("message" in unclear.response ? unclear.response.message : "")
      : "";
  if (/tout s'est bien passé|successfully opened/i.test(unclearText)) {
    failures.push("error/clarification narrated as success");
  } else {
    notes.push("clarification/error not narrated as success");
  }

  // Conversation window bound
  const store = new InMemoryConversationStore({ maxMessages: 200 });
  const conv = new ConversationService({
    store,
    windowBudget: { maxMessages: 12, maxCharacters: 3_000 },
  });
  for (let i = 0; i < 100; i++) {
    await conv.prepareTurn(`message numéro ${i} avec un peu de texte`);
    conv.appendAssistant(`réponse ${i}`);
  }
  const win = await conv.prepareTurn("dernier");
  if (win.bundle.messages.length > 12) {
    failures.push(`window messages unbounded: ${win.bundle.messages.length}`);
  } else {
    notes.push(
      `window bound after 100 turns: messages=${win.bundle.messages.length} store=${store.count()}`,
    );
  }

  return { ok: failures.length === 0, failures, notes };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Pipeline Phase 20 — Audit ===\n");
  const report = await runPipelineAudit();
  for (const n of report.notes) console.log(`  · ${n}`);
  if (report.failures.length) {
    console.log("\nFailures:");
    for (const f of report.failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\n  ✓ pipeline audit clean\n");
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
