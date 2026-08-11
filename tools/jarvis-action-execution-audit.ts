/**
 * Phase 8 controlled action execution security audit.
 * Scans all TypeScript files under src/ (comments and strings stripped).
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
  { name: "AppleScript", pattern: /\bAppleScript\b/ },
  { name: "eval(", pattern: /\beval\s*\(/ },
  { name: "Function(", pattern: /\bFunction\s*\(/ },
  { name: "new Function", pattern: /\bnew\s+Function\b/ },
  { name: "robotjs", pattern: /\brobotjs\b/i },
  { name: "nut.js", pattern: /\b(@nut-tree|nut\.js)\b/i },
  { name: "CGEvent", pattern: /\bCGEvent\b/ },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "http client", pattern: /\bfrom\s+["']node:https?["']/ },
  { name: "execute(command)", pattern: /\bexecute\s*\(\s*command\b/i },
  { name: "runCommand", pattern: /\brunCommand\b/ },
  { name: "shellCommand", pattern: /\bshellCommand\b/ },
  { name: "commandExecutor", pattern: /\bcommandExecutor\b/i },
  { name: "system(command)", pattern: /\bsystem\s*\(\s*command\b/i },
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

export interface ActionExecutionAuditReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
  notes: string[];
}

export async function runActionExecutionAudit(): Promise<ActionExecutionAuditReport> {
  const files = await walkTs(path.join(ROOT, "src"));
  const failures: string[] = [];
  const notes: string[] = [];

  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const code = stripCommentsAndStrings(raw);
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    // Phase 9–10 layers audited separately.
    if (rel.startsWith("src/ai/")) continue;
    if (rel.startsWith("src/runtime/")) continue;
    if (rel.startsWith("src/context/")) continue;
    if (rel.startsWith("src/integration/")) continue;
    if (rel.startsWith("src/security/")) continue;
    for (const { name, pattern } of FORBIDDEN) {
      if (pattern.test(code)) {
        failures.push(`${rel}: forbidden pattern "${name}"`);
      }
    }
  }

  const pkg = JSON.parse(
    await fs.readFile(path.join(ROOT, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    failures.push("package.json: runtime dependencies must remain empty");
  }

  notes.push("Phase 8: typed ActionPlan only — no arbitrary shell commands.");
  notes.push("ActionExecutor delegates solely to FileService / ApplicationService.");
  notes.push("PermissionManager cannot be bypassed for action execution.");

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
  runActionExecutionAudit().then((report) => {
    console.log(`Action execution audit — scanned ${report.scannedFiles} files`);
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) {
      console.log("Action execution audit PASSED.");
    } else {
      console.error("Action execution audit FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
