/**
 * Phase 6 screen observation security audit.
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
  { name: "kill(", pattern: /\b(?:process\.)?kill\s*\(/ },
  { name: "killall", pattern: /\bkillall\b/ },
  { name: "pkill", pattern: /\bpkill\b/ },
  { name: "robotjs", pattern: /\brobotjs\b/i },
  { name: "nut.js", pattern: /\b(@nut-tree|nut\.js)\b/i },
  { name: "CGEvent", pattern: /\bCGEvent\b/ },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "getUserMedia", pattern: /\bgetUserMedia\b/ },
  { name: "getDisplayMedia", pattern: /\bgetDisplayMedia\b/ },
  { name: "MediaRecorder", pattern: /\bMediaRecorder\b/ },
  { name: "screencapture cmd", pattern: /\bscreencapture\b/ },
  { name: "setInterval capture", pattern: /setInterval\s*\([^)]*capture/i },
  { name: "OCR lib", pattern: /\b(tesseract|ocr\.js|@napi-rs\/canvas)\b/i },
  { name: "face recognition", pattern: /\bface[-_]?recognition\b/i },
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

export interface ScreenObservationAuditReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
  notes: string[];
}

export async function runScreenObservationAudit(): Promise<ScreenObservationAuditReport> {
  const files = [
    ...(await walkTs(path.join(ROOT, "src/screen"))),
    ...(await walkTs(path.join(ROOT, "src/platform/macos"))),
    ...(await walkTs(path.join(ROOT, "src/tools"))).filter((f) =>
      /screen/i.test(path.basename(f)),
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

  notes.push("Phase 6: screen/window observation only — no UI control.");
  notes.push("Capture is HIGH, explicit, never automatic, never uploaded.");
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
  runScreenObservationAudit().then((report) => {
    console.log(`Screen observation audit — scanned ${report.scannedFiles} files`);
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) {
      console.log("Screen observation audit PASSED.");
    } else {
      console.error("Screen observation audit FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
