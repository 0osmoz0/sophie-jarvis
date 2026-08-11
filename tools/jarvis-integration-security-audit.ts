/**
 * Phase 12 Sophie integration security audit.
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
  { name: "CGEvent", pattern: /\bCGEvent\b/ },
  { name: "robotjs", pattern: /\brobotjs\b/i },
  { name: "nut.js", pattern: /\b(@nut-tree|nut\.js)\b/i },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "ActionExecutor", pattern: /\bActionExecutor\b/ },
  { name: "PermissionManager", pattern: /\bPermissionManager\b/ },
  { name: "requestState", pattern: /\brequestState\b/ },
  { name: "AnimationPlayer", pattern: /\bAnimationPlayer\b/ },
  { name: "FileService", pattern: /\bFileService\b/ },
  { name: "ApplicationService", pattern: /\bApplicationService\b/ },
  { name: "setInterval", pattern: /\bsetInterval\s*\(/ },
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

export interface IntegrationSecurityAuditReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
  notes: string[];
}

export async function runIntegrationSecurityAudit(): Promise<IntegrationSecurityAuditReport> {
  const files = await walkTs(path.join(ROOT, "src/integration"));
  const failures: string[] = [];
  const notes: string[] = [];

  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const code = stripCommentsAndStrings(raw);
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    for (const { name, pattern } of FORBIDDEN) {
      if (pattern.test(code)) {
        failures.push(`${rel}: forbidden pattern "${name}"`);
      }
    }
  }

  notes.push("Phase 12: integration is an event façade only.");
  notes.push("No ActionExecutor / FileService / shell / fetch in src/integration.");

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
  runIntegrationSecurityAudit().then((report) => {
    console.log(
      `Integration security audit — scanned ${report.scannedFiles} files`,
    );
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) console.log("Integration security audit PASSED.");
    else {
      console.error("Integration security audit FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
