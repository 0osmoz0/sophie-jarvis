/**
 * Phase 10 runtime security audit.
 * Runtime must orchestrate only — no direct system APIs.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN = [
  { name: "node:fs", pattern: /\bfrom\s+["']node:fs(?:\/promises)?["']/ },
  { name: "child_process", pattern: /\bchild_process\b/ },
  { name: "exec(", pattern: /\bexec(?:Sync)?\s*\(/ },
  { name: "spawn(", pattern: /\bspawn(?:Sync)?\s*\(/ },
  { name: "fork(", pattern: /\bfork\s*\(/ },
  { name: "osascript", pattern: /\bosascript\b/i },
  { name: "AppleScript", pattern: /\bAppleScript\b/ },
  { name: "robotjs", pattern: /\brobotjs\b/i },
  { name: "nut.js", pattern: /\b(@nut-tree|nut\.js)\b/i },
  { name: "CGEvent", pattern: /\bCGEvent\b/ },
  { name: "getUserMedia", pattern: /\bgetUserMedia\b/ },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "eval(", pattern: /\beval\s*\(/ },
  { name: "shell:true", pattern: /shell\s*:\s*true/ },
] as const;

/** CLI may use readline only — still no fs/child_process/fetch. */
const SCAN_FILES = [
  "src/runtime/JarvisRuntime.ts",
  "src/runtime/ConversationContext.ts",
  "src/runtime/ResponseFormatter.ts",
  "src/runtime/RuntimeAudit.ts",
  "src/runtime/types.ts",
  "src/runtime/index.ts",
  "src/runtime/cli.ts",
];

function stripCommentsAndStrings(source: string): string {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  out = out.replace(/(^|[^:])\/\/.*$/gm, "$1");
  out = out.replace(/`(?:\\.|[^`\\])*`/g, '""');
  out = out.replace(/"(?:\\.|[^"\\])*"/g, '""');
  out = out.replace(/'(?:\\.|[^'\\])*'/g, '""');
  return out;
}

export interface RuntimeSecurityAuditReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
  notes: string[];
}

export async function runRuntimeSecurityAudit(): Promise<RuntimeSecurityAuditReport> {
  const failures: string[] = [];
  const notes: string[] = [];
  let scanned = 0;

  for (const rel of SCAN_FILES) {
    const full = path.join(ROOT, rel);
    let raw: string;
    try {
      raw = await fs.readFile(full, "utf8");
    } catch {
      failures.push(`${rel}: missing`);
      continue;
    }
    scanned += 1;
    const code = stripCommentsAndStrings(raw);
    for (const { name, pattern } of FORBIDDEN) {
      if (pattern.test(code)) {
        failures.push(`${rel}: forbidden pattern "${name}"`);
      }
    }
  }

  notes.push("Phase 10: Runtime orchestrates IntentRouter + ActionService only.");
  notes.push("CLI uses node:readline — no shell, no child_process, no fetch.");
  notes.push("Confirmation remains Phase 8 bound tokens (not bare 'oui').");

  return { ok: failures.length === 0, scannedFiles: scanned, failures, notes };
}

const isDirect =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  runRuntimeSecurityAudit().then((report) => {
    console.log(`Runtime security audit — scanned ${report.scannedFiles} files`);
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) {
      console.log("Runtime security audit PASSED.");
    } else {
      console.error("Runtime security audit FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
