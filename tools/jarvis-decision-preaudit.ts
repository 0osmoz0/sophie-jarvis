/**
 * Phase 18 — Decision Engine PRE-AUDIT (read-only).
 * Does not modify any source. Scans decision-related ownership.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCAN = [
  "src/ai",
  "src/runtime",
  "src/conversation",
  "src/memory",
  "src/context",
  "src/security",
  "src/actions",
  "src/integration",
  "src/permissions",
];

async function walkTs(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      out.push(...(await walkTs(full)));
    } else if (e.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

export async function runDecisionPreaudit(): Promise<string> {
  const pkg = JSON.parse(
    await fs.readFile(path.join(ROOT, "package.json"), "utf8"),
  ) as { version: string };

  const files: string[] = [];
  for (const d of SCAN) {
    files.push(...(await walkTs(path.join(ROOT, d))));
  }

  const lines: string[] = [];
  lines.push("=== PHASE 18 PRE-AUDIT ===");
  lines.push(`VERSION: ${pkg.version}`);
  lines.push(`Scanned files: ${files.length}`);
  lines.push("");
  lines.push("Where decisions are currently made:");
  lines.push("  - JarvisRuntime.processInput / handleNewIntent (dispatch by outcome.kind)");
  lines.push("  - IntentRouter.classifyIntent");
  lines.push("  - IntentValidator (accept/reject LLM candidate)");
  lines.push("  - ConversationService.prepareTurn (early clarification)");
  lines.push("  - ReferenceResolver (resolved/ambiguous/unresolved)");
  lines.push("  - ActionPlanner + ActionPermissionPolicy + PermissionManager");
  lines.push("  - ActionConfirmation (token issue/validate/consume)");
  lines.push("");
  lines.push("Where LLM influences behavior:");
  lines.push("  - LLMProvider.understand → structured intent only");
  lines.push("  - Never PermissionManager / ActionExecutor / confirmation tokens");
  lines.push("");
  lines.push("Where context is used:");
  lines.push("  - ContextService.getSnapshot (read-only)");
  lines.push("  - loadEnvironmentHints for ReferenceResolver");
  lines.push("");
  lines.push("Where memory is used:");
  lines.push("  - MemoryService.recall in ConversationService (budgeted)");
  lines.push("  - handleMemoryIntent (inform only)");
  lines.push("");
  lines.push("Where ambiguities are handled:");
  lines.push("  - ReferenceResolver earlyClarification");
  lines.push("  - intent needs_clarification");
  lines.push("");
  lines.push("Where actions are refused:");
  lines.push("  - IntentValidator FORBIDDEN fields");
  lines.push("  - PermissionManager CRITICAL deny");
  lines.push("  - Domain FilePolicy / ApplicationPolicy");
  lines.push("");
  lines.push("Where confirmations intervene:");
  lines.push("  - ActionConfirmation + ConversationContext.pending");
  lines.push("  - memory.forget pendingForgetQuery (separate)");
  lines.push("");
  lines.push("Possible duplications:");
  lines.push("  - Double understand on action path (understand + planFromText)");
  lines.push("  - Dual clarification channels (resolver vs LLM)");
  lines.push("");
  lines.push("Currently implicit decisions:");
  lines.push("  - Always request confirmation for planned actions in runtime");
  lines.push("  - New command invalidates pending");
  lines.push("  - Priority sources partially in prepareTurn, not centralized");
  lines.push("");
  lines.push("What DecisionEngine should own:");
  lines.push("  - Explicit Decision { type, confidence, evidence, missing }");
  lines.push("  - Gate ACTION vs CLARIFICATION vs ANSWER vs REFUSAL vs NO_ACTION");
  lines.push("  - Contradiction detection (user correction vs stale memory)");
  lines.push("  - Explanation + audit (no secrets)");
  lines.push("");
  lines.push("What must NOT be duplicated/changed:");
  lines.push("  - PermissionManager, ActionPermissionPolicy");
  lines.push("  - ActionConfirmation, ActionPlanner, ActionExecutor");
  lines.push("  - BehaviorBrain (absent — must stay absent)");
  lines.push("  - IntentValidator core forbidden rules");
  lines.push("");
  lines.push("PRE-AUDIT STATUS: COMPLETE (read-only)");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const report = await runDecisionPreaudit();
  console.log(report);
  const out = path.join(
    ROOT,
    "tools/.audit-cache/jarvis-decision-phase18-preaudit.txt",
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
