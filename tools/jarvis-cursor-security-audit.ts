/**
 * Phase 25 — Cursor security audit.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN = [
  "ActionExecutor",
  "PermissionManager",
  "ActionConfirmation",
  "ActionPlanner",
  "BehaviorBrain",
  "child_process",
  "exec(",
  "spawn(",
  "CGEventPost",
  "setInterval(",
] as const;

function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\.|[^`\\])*`/g, '""');
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== "node_modules") {
      out.push(...(await walk(full)));
    } else if (e.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Cursor — Security Audit ===\n");
  const dirs = [
    path.join(ROOT, "src/context"),
    path.join(ROOT, "src/platform/macos"),
  ];
  const failures: string[] = [];
  for (const dir of dirs) {
    for (const file of await walk(dir)) {
      const rel = path.relative(ROOT, file);
      if (!/Cursor|Focus|Environment|Motion|AudioContext|FocusedWindow/.test(rel)) {
        continue;
      }
      const code = strip(await fs.readFile(file, "utf8"));
      for (const f of FORBIDDEN) {
        if (code.includes(f)) failures.push(`${rel}: ${f}`);
      }
    }
  }
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("  ✓ observation modules have no executor/shell/polling");
    console.log("  ✓ environment observation ≠ authorization\n");
  }
}

main();
