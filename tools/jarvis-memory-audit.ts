/**
 * Phase 16 memory audit — memory layer must stay non-executive.
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
  { name: "robotjs", pattern: /\brobotjs\b/i },
  { name: "nut.js", pattern: /\b(@nut-tree|nut\.js)\b/i },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "getUserMedia", pattern: /\bgetUserMedia\b/ },
  { name: "ActionExecutor", pattern: /\bActionExecutor\b/ },
  { name: "ApplicationService", pattern: /\bApplicationService\b/ },
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

export interface MemoryPhaseAuditReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
  notes: string[];
}

export async function runMemoryPhaseAudit(): Promise<MemoryPhaseAuditReport> {
  const files = [
    ...(await walkTs(path.join(ROOT, "src/memory"))),
    path.join(ROOT, "src/tools/memoryTools.ts"),
  ];
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
    for (const { name, pattern } of FORBIDDEN) {
      if (pattern.test(code)) {
        failures.push(`${rel}: forbidden pattern "${name}"`);
      }
    }
  }

  notes.push("Phase 16: Memory informs only — never executes.");
  notes.push("No ActionExecutor / ApplicationService / BehaviorBrain imports.");
  notes.push("Local JSON persistence only — no network upload.");

  return {
    ok: failures.length === 0,
    scannedFiles: files.length,
    failures,
    notes,
  };
}

const isDirect =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  runMemoryPhaseAudit().then((report) => {
    console.log(`Memory phase audit — scanned ${report.scannedFiles} files`);
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) console.log("Memory phase audit PASSED.");
    else {
      console.error("Memory phase audit FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
