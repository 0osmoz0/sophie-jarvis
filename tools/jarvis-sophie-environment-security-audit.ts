/**
 * Phase 26 — Sophie environment security audit.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN = [
  "ActionExecutor",
  "PermissionManager",
  "ActionConfirmation",
  "DecisionEngine",
  "FileService",
  "ApplicationService",
  "BehaviorBrain",
  "child_process",
  "exec(",
  "spawn(",
  "setInterval(",
  "camera",
  "clipboard",
  "keystroke",
] as const;

function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Sophie Environment — Security Audit ===\n");
  const files = (await fs.readdir(path.join(ROOT, "src/context"))).filter(
    (f) => f.startsWith("Sophie") && f.endsWith(".ts"),
  );
  const failures: string[] = [];
  for (const f of files) {
    const code = strip(
      await fs.readFile(path.join(ROOT, "src/context", f), "utf8"),
    );
    for (const bad of FORBIDDEN) {
      if (code.includes(bad)) failures.push(`${f}: ${bad}`);
    }
  }
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("  ✓ Sophie* modules observation-only");
    console.log("  ✓ no BehaviorBrain / executor / polling\n");
  }
}

main();
