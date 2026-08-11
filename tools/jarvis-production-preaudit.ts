/**
 * Phase 21 — Production PRE-AUDIT (read-only analysis + light probes).
 * Does not modify production behavior beyond measurement.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const lines = [
    "=== JARVIS PRODUCTION PRE-AUDIT — PHASE 21 ===",
    "",
    "STATE OWNERSHIP",
    "---------------",
    "runtime FSM:           JarvisRuntime.state (IDLE|UNDERSTANDING|PLANNING|WAITING_CONFIRMATION|EXECUTING|…)",
    "conversation:          ConversationService + InMemoryConversationStore (bounded)",
    "confirmation pending:  ConversationContext.pending + ActionConfirmation tokens",
    "memory:                MemoryService / MemoryStore (inform only)",
    "decision:              DecisionEngine (stateless) + JarvisRuntime.lastDecision",
    "response:              ResponseGenerator (stateless per call)",
    "timing:                InteractionTiming + PipelineTiming + RequestPipelineContext",
    "error (user-facing):   JarvisResponse type=error via ResponseFormatter",
    "observability (new):   PipelineTraceCollector + PipelineMetrics (passive)",
    "",
    "ERROR OWNERSHIP",
    "---------------",
    "LLM error:         IntentRouter → handleNewIntent → formatter.llmUnavailable/error → finish/audit",
    "validation:        IntentValidator → rejected → formatter.error → finish",
    "decision:          DecisionEngine REFUSAL/DEFER → finish",
    "planning:          planFromOutcome fail → denied/unavailable/PLAN_FAILED",
    "permission:        ActionService.requestConfirmation DENIED → formatter.denied",
    "confirmation:      expire/invalid/no pending → formatter.expired/noPending",
    "execution:         actions.execute fail → naturalize ACTION_FAILURE → error",
    "response:          naturalize catch → deterministic fallback (no silent success rewrite)",
    "context:           missing service / throw → unavailable/error",
    "memory:            missing service → continue/unavailable; forget has own confirm",
    "",
    "RECOVERY RISKS (pre-hardening)",
    "------------------------------",
    "UNDERSTANDING/PLANNING/EXECUTING: throw before finish could leave stuck state",
    "  → Phase 21: processInput try/finally resets these to IDLE",
    "WAITING_CONFIRMATION: intentional until oui/non/expire/new command",
    "ERROR state: finish remaps ERROR→IDLE (no durable ERROR stuck)",
    "pending confirmation orphan: cleared on expire / new command / cancel",
    "double oui: ActionConfirmation.consume + clearPending → second oui rejected",
    "CLI catch: did not reset state historically → runtime now self-recovers",
    "",
    "IDEMPOTENCE (existing)",
    "----------------------",
    "confirm token single-use (consumed Set)",
    "execute ALREADY_COMPLETED after success",
    "runtime clearPending after execute",
    "",
    "RESTART",
    "-------",
    "MUST survive: MemoryService persistence (JsonMemoryPersistence) when configured",
    "MUST disappear: pending confirmation, in-flight request, EXECUTING/UNDERSTANDING,",
    "  ConversationContext.pending, ActionConfirmation in-memory tokens",
    "Post-restart 'oui' cannot execute prior action (new empty ActionService)",
    "",
    "OBSERVABILITY GAPS (addressed in Phase 21)",
    "------------------------------------------",
    "No unified requestId stage trace before Phase 21",
    "permissionMs / validationMs often null (not invented as 0)",
    "No --trace / --metrics CLI",
    "No centralized JarvisError taxonomy",
    "No bounded production metrics counters",
    "",
    "PRE-AUDIT STATUS: COMPLETE (read-only)",
  ];

  const report = lines.join("\n");
  console.log(report);
  const out = path.join(
    ROOT,
    "tools/.audit-cache/jarvis-observability-phase21-preaudit.txt",
  );
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, report + "\n", "utf8");
  console.log(`\nWrote ${path.relative(ROOT, out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
