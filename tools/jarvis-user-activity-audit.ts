/**
 * Phase 7 user activity / presence security audit.
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
  { name: "CGEventTap", pattern: /\bCGEventTap\b/ },
  { name: "IOHID intercept", pattern: /\bIOHID\w*(?:Manager|Event|Queue)\b/ },
  { name: "keyboard hook", pattern: /\b(?:keylogger|keyboardHook|KeyHook)\b/i },
  { name: "mouse hook", pattern: /\b(?:mouseHook|MouseHook|NSEvent\.addGlobal)\b/ },
  { name: "mouse coordinates", pattern: /\b(?:clientX|pageX|screenX|mouseX)\b/ },
  { name: "clipboard", pattern: /\b(?:clipboard|NSPasteboard|readText)\b/i },
  { name: "camera", pattern: /\b(?:getUserMedia|AVCaptureSession)\b/ },
  { name: "audio input", pattern: /\b(?:getUserMedia|AudioContext\.createMediaStream)\b/ },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "http client", pattern: /\bfrom\s+["']node:https?["']/ },
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

export interface UserActivityAuditReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
  notes: string[];
}

export async function runUserActivityAudit(): Promise<UserActivityAuditReport> {
  const files = [
    ...(await walkTs(path.join(ROOT, "src/presence"))),
    ...(await walkTs(path.join(ROOT, "src/platform/macos"))),
    ...(await walkTs(path.join(ROOT, "src/tools"))).filter((f) =>
      /userActivity|userPresence|registerPresence|presence/i.test(
        path.basename(f),
      ),
    ),
  ];
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

  const pkg = JSON.parse(
    await fs.readFile(path.join(ROOT, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    failures.push("package.json: runtime dependencies must remain empty");
  }

  notes.push(
    "Phase 7: aggregate idle/activity only — no key/mouse content recording.",
  );
  notes.push("IDLE does not prove physical absence.");
  notes.push("Without native bridge, capabilities remain UNAVAILABLE.");

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
  runUserActivityAudit().then((report) => {
    console.log(`User activity audit — scanned ${report.scannedFiles} files`);
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) {
      console.log("User activity audit PASSED.");
    } else {
      console.error("User activity audit FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
