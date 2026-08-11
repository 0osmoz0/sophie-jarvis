/**
 * Phase 17 conversation security audit.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IntentValidator } from "../src/ai/IntentValidator.js";
import {
  ConversationService,
  ReferenceResolver,
  EntityTracker,
} from "../src/conversation/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface ConversationSecurityAuditReport {
  ok: boolean;
  failures: string[];
  notes: string[];
}

export async function runConversationSecurityAudit(): Promise<ConversationSecurityAuditReport> {
  const failures: string[] = [];
  const notes: string[] = [];
  const validator = new IntentValidator();

  const injections = [
    {
      type: "application.open",
      payload: { application: "Safari" },
      execute: true,
    },
    {
      intent: "file.delete",
      permissionGranted: true,
      entities: [{ path: "/tmp/x" }],
    },
    {
      intent: "application.close",
      confirmationGranted: true,
      entities: [{ application: "Safari" }],
    },
    {
      type: "application.open",
      payload: { application: "Safari", shell: "bash" },
    },
  ];

  for (const cand of injections) {
    const r = validator.validate(cand);
    if (r.ok) {
      failures.push(`validator accepted forbidden candidate: ${JSON.stringify(cand)}`);
    }
  }
  notes.push("IntentValidator rejects execute / permissionGranted / confirmationGranted");

  // Conversation history must not grant confirmation
  const conv = new ConversationService();
  await conv.prepareTurn("ouvre Safari");
  await conv.prepareTurn("oui");
  // No ActionConfirmation token exists here — service has no execute path
  notes.push("ConversationService has no ActionExecutor / PermissionManager");

  // Prior assistant message cannot authorize
  const entities = new EntityTracker();
  entities.track({
    id: "1",
    type: "application",
    label: "Safari",
    lastMentionedAt: Date.now(),
    sourceMessageId: "m1",
    confidence: 0.9,
  });
  const ref = new ReferenceResolver().resolve("ferme-le", entities);
  if (!ref.resolved) {
    failures.push("expected reference resolve for safety pipeline test");
  } else {
    notes.push(
      "Resolved reference is information only (confidence=" +
        ref.confidence.toFixed(2) +
        ")",
    );
  }

  // Scan conversation sources for bypass APIs
  const dir = path.join(ROOT, "src/conversation");
  const files = await fs.readdir(dir);
  for (const name of files) {
    if (!name.endsWith(".ts")) continue;
    const raw = await fs.readFile(path.join(dir, name), "utf8");
    if (/\bActionExecutor\b/.test(raw)) {
      failures.push(`${name}: ActionExecutor`);
    }
    if (/\bPermissionManager\b/.test(raw)) {
      failures.push(`${name}: PermissionManager`);
    }
    if (/\bchild_process\b/.test(raw)) {
      failures.push(`${name}: child_process`);
    }
  }

  return { ok: failures.length === 0, failures, notes };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Conversation Phase 17 — Security Audit ===\n");
  const report = await runConversationSecurityAudit();
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
