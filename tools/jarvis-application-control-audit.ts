/**
 * Phase 4 application-control security audit.
 * Lifecycle only — no shell, no UI automation, no kill, no network/camera.
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
  { name: "kill(", pattern: /\b(?:process\.)?kill\s*\(/ },
  { name: "killall", pattern: /\bkillall\b/ },
  { name: "pkill", pattern: /\bpkill\b/ },
  { name: "SIGKILL", pattern: /\bSIGKILL\b/ },
  { name: "robotjs", pattern: /\brobotjs\b/i },
  { name: "nut.js", pattern: /\b(@nut-tree|nut\.js)\b/i },
  { name: "CGEvent", pattern: /\bCGEvent\b/ },
  { name: "AXUIElement", pattern: /\bAXUIElement\b/ },
  { name: "clipboard automation", pattern: /\bclipboard\.(write|read)\b/i },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "getUserMedia", pattern: /\bgetUserMedia\b/ },
  { name: "getDisplayMedia", pattern: /\bgetDisplayMedia\b/ },
  { name: "MediaRecorder", pattern: /\bMediaRecorder\b/ },
  { name: "eval(", pattern: /\beval\s*\(/ },
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

export interface ApplicationControlAuditReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
  notes: string[];
}

export async function runApplicationControlAudit(): Promise<ApplicationControlAuditReport> {
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

    for (const { name, pattern } of FORBIDDEN) {
      if (pattern.test(code)) {
        failures.push(`${rel}: forbidden pattern "${name}"`);
      }
    }

    // Tools must not import child_process or call ApplicationService internals via fs
    if (rel.startsWith("src/tools/application") && /from\s+["']node:child_process["']/.test(code)) {
      failures.push(`${rel}: application tools must not import child_process`);
    }
  }

  const pkg = JSON.parse(
    await fs.readFile(path.join(ROOT, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    failures.push("package.json: runtime dependencies must remain empty");
  }

  const forbiddenDeps = ["robotjs", "@nut-tree/nut-js", "nut.js", "node-window-manager"];
  // Check package.json text
  const pkgText = await fs.readFile(path.join(ROOT, "package.json"), "utf8");
  for (const dep of forbiddenDeps) {
    if (pkgText.includes(`"${dep}"`)) {
      failures.push(`package.json: forbidden dependency ${dep}`);
    }
  }

  notes.push("Phase 4 is application lifecycle only (list/info/active/open/close).");
  notes.push("No UI automation, shell, kill, network, camera, or microphone.");
  notes.push("Default ApplicationService open/close return UNAVAILABLE without native backend.");

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
  runApplicationControlAudit().then((report) => {
    console.log(`Application-control audit — scanned ${report.scannedFiles} source files`);
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) {
      console.log("Application-control audit PASSED.");
    } else {
      console.error("Application-control audit FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
