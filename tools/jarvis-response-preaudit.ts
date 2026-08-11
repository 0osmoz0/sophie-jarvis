/**
 * Phase 19 — Response Intelligence PRE-AUDIT (read-only).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function runResponsePreaudit(): Promise<string> {
  const pkg = JSON.parse(
    await fs.readFile(path.join(ROOT, "package.json"), "utf8"),
  ) as { version: string };

  const lines = [
    "=== PHASE 19 RESPONSE PRE-AUDIT ===",
    "",
    `VERSION: ${pkg.version}`,
    "",
    "CURRENT RESPONSE PATH",
    "---------------------",
    "JarvisRuntime.processInput → DecisionEngine → ResponseFormatter /",
    "ContextFormatter / inline security-memory strings → finish →",
    "conversation.appendAssistant. LLMProvider.understand only (no NL).",
    "",
    "AVAILABLE RESULT DATA",
    "---------------------",
    "Decision, IntentRouterOutcome, ContextSnapshot, Security alerts,",
    "Memory records, ActionPlan, executed.result (often unused in message).",
    "",
    "CURRENT HARDCODED RESPONSES",
    "---------------------------",
    "ResponseFormatter (greeting, conversation, successMessage FILE_*/APP_*),",
    "ActionConfirmation messages, ContextFormatter labels, DecisionEngine hints,",
    "JarvisRuntime memory/security inline French strings.",
    "",
    "MISSING RESPONSE CAPABILITIES",
    "-----------------------------",
    "No LLM generateResponse; no ResponseDraft; action results not narrated;",
    "no shared NL polish over context/security/memory answers.",
    "",
    "SECURITY BOUNDARIES",
    "-------------------",
    "LLM must not execute; IntentValidator + DecisionEngine + Phase 8 pipeline.",
    "Response layer must remain explain-only.",
    "",
    "DUPLICATIONS",
    "------------",
    "Clarification strings in Conversation/Decision/Formatter/MockLLM;",
    "runtime ResponseFormatter vs potential response module formatter.",
    "",
    "RECOMMENDATIONS",
    "---------------",
    "1. Add src/response/ with ResponseDraft + Generator + Policy + Validator",
    "2. LLMProvider.generateResponse() separate from understand()",
    "3. Deterministic fallback when LLM unavailable",
    "4. Facts-only input; never invent action/context results",
    "",
    "PRE-AUDIT STATUS: COMPLETE (read-only)",
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  const report = await runResponsePreaudit();
  console.log(report);
  const out = path.join(
    ROOT,
    "tools/.audit-cache/jarvis-response-phase19-preaudit.txt",
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
