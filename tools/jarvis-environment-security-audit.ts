/**
 * Phase 24 — Environment security audit.
 * Environment* modules must stay observation-only.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN = [
  { name: "ActionExecutor", pattern: /\bActionExecutor\b/ },
  { name: "PermissionManager", pattern: /\bPermissionManager\b/ },
  { name: "ActionConfirmation", pattern: /\bActionConfirmation\b/ },
  { name: "FileService", pattern: /\bFileService\b/ },
  { name: "ApplicationService", pattern: /\bApplicationService\b/ },
  { name: "BehaviorBrain", pattern: /\bBehaviorBrain\b/ },
  { name: "child_process", pattern: /\bchild_process\b/ },
  { name: "exec(", pattern: /\bexec(?:Sync)?\s*\(/ },
  { name: "spawn(", pattern: /\bspawn(?:Sync)?\s*\(/ },
  { name: "fork(", pattern: /\bfork\s*\(/ },
  { name: "shell:true", pattern: /shell\s*:\s*true/ },
  { name: "osascript", pattern: /\bosascript\b/i },
  { name: "CGEventPost", pattern: /\bCGEventPost\b/ },
  { name: "robotjs", pattern: /\brobotjs\b/i },
  { name: "camera", pattern: /\bcamera\b/i },
  { name: "microphone recording", pattern: /\bmicrophone\s+record/i },
  { name: "continuous capture", pattern: /\bcontinuous\s+capture/i },
  { name: "setInterval", pattern: /\bsetInterval\s*\(/ },
] as const;

function strip(source: string): string {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  out = out.replace(/(^|[^:])\/\/.*$/gm, "$1");
  out = out.replace(/`(?:\\.|[^`\\])*`/g, '""');
  out = out.replace(/"(?:\\.|[^"\\])*"/g, '""');
  out = out.replace(/'(?:\\.|[^'\\])*'/g, '""');
  return out;
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Environment — Security Audit ===\n");
  const failures: string[] = [];
  const dir = path.join(ROOT, "src/context");
  const files = (await fs.readdir(dir)).filter(
    (f) => f.startsWith("Environment") && f.endsWith(".ts"),
  );
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const code = strip(raw);
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(code)) {
        failures.push(`src/context/${f}: ${rule.name}`);
      }
    }
  }

  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("  ✓ Environment* modules observation-only");
    console.log("  ✓ no executor / permission / shell / camera / polling\n");
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
