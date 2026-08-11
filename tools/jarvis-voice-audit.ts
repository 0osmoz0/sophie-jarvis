/**
 * Phase 23 — Voice security audit (src/voice must stay non-executive).
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
  { name: "exec(", pattern: /\bexec(?:Sync)?\s*\(/ },
  { name: "spawn(", pattern: /\bspawn(?:Sync)?\s*\(/ },
  { name: "fork(", pattern: /\bfork\s*\(/ },
  { name: "shell:true", pattern: /shell\s*:\s*true/ },
  { name: "osascript", pattern: /\bosascript\b/i },
  { name: "CGEventPost", pattern: /\bCGEventPost\b/ },
  { name: "robotjs", pattern: /\brobotjs\b/i },
  { name: "camera", pattern: /\bcamera\b/i },
  { name: "clipboard", pattern: /\bclipboard\b/i },
  { name: "keystrokes", pattern: /\bkeystrokes?\b/i },
  { name: "continuous recording", pattern: /\bcontinuous\s+record/i },
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
  console.log("\n=== JARVIS Voice — Security Audit ===\n");
  const failures: string[] = [];
  const dir = path.join(ROOT, "src/voice");
  const files = await fs.readdir(dir);
  for (const f of files) {
    if (!f.endsWith(".ts")) continue;
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const code = strip(raw);
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(code)) {
        failures.push(`src/voice/${f}: ${rule.name}`);
      }
    }
  }
  // VoiceService may import JarvisRuntime — allowed; must not import auth/exec modules.
  const vs = strip(
    await fs.readFile(path.join(dir, "VoiceService.ts"), "utf8"),
  );
  if (
    /\bfrom\s+["'][^"']*(?:ActionExecutor|PermissionManager|ActionConfirmation)[^"']*["']/.test(
      vs,
    ) ||
    /\bimport\s*\{[^}]*(?:ActionExecutor|PermissionManager|ActionConfirmation)/.test(
      vs,
    )
  ) {
    failures.push("VoiceService imports auth/exec");
  }

  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("  ✓ src/voice has no executor/permission/shell/camera");
    console.log("  ✓ Voice remains an interface layer\n");
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
