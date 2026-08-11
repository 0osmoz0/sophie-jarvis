/**
 * Phase 20 — Pipeline PRE-AUDIT (measures + static analysis).
 */
import fs from "node:fs/promises";
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeRuntime(provider: MockLLMProvider) {
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
  return new JarvisRuntime({
    router: new IntentRouter({ provider, actions }),
    actions,
    responseLlm: provider,
  });
}

export async function runPipelinePreaudit(): Promise<string> {
  const provider = new MockLLMProvider();
  let understandCalls = 0;
  const orig = provider.understand.bind(provider);
  provider.understand = async (req) => {
    understandCalls += 1;
    return orig(req);
  };

  const runtime = makeRuntime(provider);

  // Action path: should be 1 understand after Phase 20 fix
  understandCalls = 0;
  const open = await runtime.processInput("ouvre Safari");
  const openUnderstands = understandCalls;
  await runtime.processInput("oui");

  understandCalls = 0;
  await runtime.processInput("bonjour");
  const helloUnderstands = understandCalls;

  understandCalls = 0;
  await runtime.processInput("ferme-le");
  const clarifyUnderstands = understandCalls;

  const lines = [
    "=== JARVIS PIPELINE PRE-AUDIT ===",
    "",
    "INPUT",
    "-----",
    "User text → ConversationService.prepareTurn → IntentRouter.understand",
    "",
    "UNDERSTAND",
    "----------",
    `calls (ouvre Safari action path): ${openUnderstands} (target: 1)`,
    `calls (bonjour): ${helloUnderstands}`,
    `calls (ferme-le no context): ${clarifyUnderstands}`,
    `latency (action open totalMs): ${open.timing.totalMs.toFixed(3)}`,
    `duplicate calls: ${openUnderstands > 1 ? "YES — still present" : "NO — single-pass OK"}`,
    "",
    "VALIDATION",
    "----------",
    "IntentValidator inside IntentRouter.understand (once per understand)",
    "",
    "DECISION",
    "--------",
    "DecisionEngine.evaluate once per new intent turn",
    `decisionMs (open): ${open.timing.decisionMs ?? "n/a"}`,
    "",
    "PLANNING",
    "--------",
    "IntentRouter.planFromOutcome (no second LLM) → ActionService.plan",
    `planningMs: ${open.timing.planningMs ?? "n/a"}`,
    "",
    "PERMISSION",
    "----------",
    "ActionPermissionPolicy / PermissionManager inside ActionService (unchanged)",
    "",
    "CONFIRMATION",
    "------------",
    "ActionConfirmation token issue; user oui/non",
    "",
    "EXECUTION",
    "---------",
    "ActionExecutor only after confirm (unchanged)",
    "",
    "RESPONSE",
    "--------",
    "ResponseGenerator.naturalize once per narrated branch",
    `responseGenerationMs: ${open.timing.responseGenerationMs ?? "n/a"}`,
    "",
    "TOTAL",
    "-----",
    `open turn totalMs: ${open.timing.totalMs.toFixed(3)}`,
    `llmUnderstandCalls: ${open.timing.llmUnderstandCalls ?? 0}`,
    "",
    "DUPLICATIONS",
    "------------",
    "Historical: planFromText re-called understand (Phase 10–19)",
    "Fixed target: planFromOutcome reuses ValidatedIntent",
    "",
    "BOTTLENECKS",
    "-----------",
    "With mock LLM: runtime overhead dominates (sub-ms to few ms)",
    "With Ollama: understand + response generation dominate (measure separately)",
    "",
    "RECOMMENDATIONS",
    "---------------",
    "1. Keep single-pass understand (planFromOutcome)",
    "2. Expose PipelineTiming via --timing",
    "3. Measure Ollama separately (no invented numbers)",
    "4. Keep memory/context selective recall (already present)",
    "",
    `PRE-AUDIT STATUS: ${openUnderstands === 1 ? "SINGLE-PASS VERIFIED" : "NEEDS FIX"}`,
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  const report = await runPipelinePreaudit();
  console.log(report);
  const out = path.join(
    ROOT,
    "tools/.audit-cache/jarvis-pipeline-phase20-preaudit.txt",
  );
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, report + "\n", "utf8");
  console.log(`\nWrote ${path.relative(ROOT, out)}`);
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
