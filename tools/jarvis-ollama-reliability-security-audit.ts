/**
 * Phase 22 — Ollama reliability security audit.
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
  { name: "child_process", pattern: /\bchild_process\b/ },
  { name: "osascript", pattern: /\bosascript\b/i },
  { name: "CGEventPost", pattern: /\bCGEventPost\b/ },
  { name: "robotjs", pattern: /\brobotjs\b/i },
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

async function main(): Promise<void> {
  console.log("\n=== JARVIS Ollama Reliability — Security Audit ===\n");
  const failures: string[] = [];
  const dir = path.join(ROOT, "src/ai");
  const files = await fs.readdir(dir);
  for (const f of files) {
    if (!f.endsWith(".ts")) continue;
    // LLMHealth / Ollama may mention fetch — allowed for loopback only
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const code = strip(raw);
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(code)) {
        failures.push(`src/ai/${f}: ${rule.name}`);
      }
    }
  }
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("  ✓ src/ai has no executor/permission/shell/camera access");
    console.log("  ✓ LLM remains non-executive\n");
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
