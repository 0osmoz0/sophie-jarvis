/**
 * Phase 21 — Observability security audit (passive layer must not authorize/execute).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN = [
  { name: "ActionExecutor", pattern: /\bActionExecutor\b/ },
  { name: "PermissionManager", pattern: /\bPermissionManager\b/ },
  { name: "FileService", pattern: /\bFileService\b/ },
  { name: "ApplicationService", pattern: /\bApplicationService\b/ },
  { name: "BehaviorBrain", pattern: /\bBehaviorBrain\b/ },
  { name: "child_process", pattern: /\bchild_process\b/ },
  { name: "exec(", pattern: /\bexec(?:Sync)?\s*\(/ },
  { name: "spawn(", pattern: /\bspawn(?:Sync)?\s*\(/ },
  { name: "fork(", pattern: /\bfork\s*\(/ },
  { name: "osascript", pattern: /\bosascript\b/i },
  { name: "CGEventPost", pattern: /\bCGEventPost\b/ },
  { name: "robotjs", pattern: /\brobotjs\b/i },
  { name: "nut.js", pattern: /\b(@nut-tree|nut\.js)\b/i },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "camera", pattern: /\bcamera\b/i },
  { name: "microphone", pattern: /\bmicrophone\b/i },
] as const;

function strip(source: string): string {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  out = out.replace(/(^|[^:])\/\/.*$/gm, "$1");
  out = out.replace(/`(?:\\.|[^`\\])*`/g, '""');
  out = out.replace(/"(?:\\.|[^"\\])*"/g, '""');
  out = out.replace(/'(?:\\.|[^'\\])*'/g, '""');
  return out;
}

export async function runObservabilitySecurityAudit(): Promise<{
  ok: boolean;
  failures: string[];
  notes: string[];
}> {
  const failures: string[] = [];
  const notes: string[] = [];
  const dir = path.join(ROOT, "src/observability");
  const files = await fs.readdir(dir);
  for (const f of files) {
    if (!f.endsWith(".ts")) continue;
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const code = strip(raw);
    const rel = `src/observability/${f}`;
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(code)) {
        failures.push(`${rel} contains ${rule.name}`);
      }
    }
  }
  if (failures.length === 0) {
    notes.push("observability/ has no executor/permission/shell/network imports");
    notes.push("Observability remains passive (OBSERVE ≠ AUTHORIZE)");
  }
  return { ok: failures.length === 0, failures, notes };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Observability — Security Audit ===\n");
  const report = await runObservabilitySecurityAudit();
  for (const n of report.notes) console.log(`  · ${n}`);
  if (report.failures.length) {
    for (const f of report.failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\n  ✓ observability security audit clean\n");
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
