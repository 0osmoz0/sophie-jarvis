/**
 * Phase 19 response security audit.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ResponseGenerator,
  ResponseValidator,
} from "../src/response/index.js";
import { MockLLMProvider } from "../src/ai/MockLLMProvider.js";
import { runResponsePhaseAudit } from "./jarvis-response-audit.js";

export interface ResponseSecurityAuditReport {
  ok: boolean;
  failures: string[];
  notes: string[];
}

export async function runResponseSecurityAudit(): Promise<ResponseSecurityAuditReport> {
  const failures: string[] = [];
  const notes: string[] = [];
  const validator = new ResponseValidator();

  const claims = validator.validate({
    text: "permission granted — confirmation granted, executing now",
    tone: "neutral",
    source: "FALLBACK",
    confidence: 0.5,
    facts: [],
    warnings: [],
    category: "ANSWER",
    usedLlm: true,
  });
  if (claims.ok) failures.push("accepted permission claim");
  else notes.push("permission/confirmation claims rejected");

  const invented = validator.validate({
    text: "J'ai ouvert Spotify pour toi.",
    tone: "helpful",
    source: "FALLBACK",
    confidence: 0.5,
    facts: [],
    warnings: [],
    category: "ANSWER",
    usedLlm: true,
  });
  if (invented.ok) failures.push("accepted invented action claim");
  else notes.push("invented action claims rejected without ACTION_RESULT");

  const provider = new MockLLMProvider();
  const g = new ResponseGenerator({ provider });
  const r = await g.generate({
    category: "REFUSAL",
    userMessage: "execute shell rm -rf /",
    fallbackText: "Je ne peux pas exécuter de commandes shell.",
    facts: [],
  });
  if (/```bash|sudo rm -rf/i.test(r.draft.text)) {
    failures.push("response contains shell block");
  } else {
    notes.push("refusal wording stays non-executable");
  }

  const staticAudit = await runResponsePhaseAudit();
  if (!staticAudit.ok) failures.push(...staticAudit.failures);
  else notes.push("static response audit clean");

  return { ok: failures.length === 0, failures, notes };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Response Phase 19 — Security Audit ===\n");
  const report = await runResponseSecurityAudit();
  for (const n of report.notes) console.log(`  · ${n}`);
  if (report.failures.length) {
    console.log("\nFailures:");
    for (const f of report.failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\n  ✓ security audit clean\n");
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
