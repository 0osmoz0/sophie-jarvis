/**
 * Phase 17 conversation audit — conversation layer must stay non-executive.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN = [
  { name: "child_process", pattern: /\bchild_process\b/ },
  { name: "exec(", pattern: /\bexec(?:Sync)?\s*\(/ },
  { name: "spawn(", pattern: /\bspawn(?:Sync)?\s*\(/ },
  { name: "fork(", pattern: /\bfork\s*\(/ },
  { name: "shell:true", pattern: /shell\s*:\s*true/ },
  { name: "osascript", pattern: /\bosascript\b/i },
  { name: "CGEventPost", pattern: /\bCGEventPost\b/ },
  { name: "CGEvent", pattern: /\bCGEvent\b/ },
  { name: "robotjs", pattern: /\brobotjs\b/i },
  { name: "getUserMedia", pattern: /\bgetUserMedia\b/ },
  { name: "ActionExecutor", pattern: /\bActionExecutor\b/ },
  { name: "PermissionManager", pattern: /\bPermissionManager\b/ },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "AnimationPlayer", pattern: /\bAnimationPlayer\b/ },
  { name: "BehaviorBrain", pattern: /\bBehaviorBrain\b/ },
] as const;

function stripCommentsAndStrings(source: string): string {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  out = out.replace(/(^|[^:])\/\/.*$/gm, "$1");
  out = out.replace(/`(?:\\.|[^`\\])*`/g, '""');
  out = out.replace(/"(?:\\.|[^"\\])*"/g, '""');
  out = out.replace(/'(?:\\.|[^'\\])*'/g, '""');
  return out;
}

async function walkTs(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      out.push(...(await walkTs(full)));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

export interface ConversationPhaseAuditReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
  notes: string[];
}

export async function runConversationPhaseAudit(): Promise<ConversationPhaseAuditReport> {
  const files = await walkTs(path.join(ROOT, "src/conversation"));
  const failures: string[] = [];
  const notes: string[] = [];

  for (const file of files) {
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    const code = stripCommentsAndStrings(raw);
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");

    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(code)) {
        failures.push(`${rel}: forbidden ${rule.name}`);
      }
    }

    if (/\bMemoryService\b/.test(code) && !/recall|MemoryService/.test(raw)) {
      // ConversationService may import MemoryService for recall only — OK
    }
    if (/\.remember\s*\(/.test(code)) {
      failures.push(`${rel}: must not write memory directly`);
    }
  }

  notes.push("Conversation module scanned for shell/native/executor bypasses");
  notes.push("Memory write from conversation layer is forbidden");

  return {
    ok: failures.length === 0,
    scannedFiles: files.length,
    failures,
    notes,
  };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Conversation Phase 17 — Audit ===\n");
  const report = await runConversationPhaseAudit();
  console.log(`Scanned: ${report.scannedFiles} files`);
  for (const n of report.notes) console.log(`  · ${n}`);
  if (report.failures.length) {
    console.log("\nFailures:");
    for (const f of report.failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\n  ✓ audit clean\n");
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
