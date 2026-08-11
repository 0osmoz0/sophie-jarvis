/**
 * Phase 13 macOS native security audit.
 * Scans TS bridges + Objective-C++ addon sources.
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
  { name: "killall", pattern: /\bkillall\b/ },
  { name: "pkill", pattern: /\bpkill\b/ },
  { name: "SIGKILL", pattern: /\bSIGKILL\b/ },
  { name: "forceTerminate", pattern: /\bforceTerminate\b/ },
  { name: "CGEventPost", pattern: /\bCGEventPost\b/ },
  { name: "CGEventCreate", pattern: /\bCGEventCreate\b/ },
  { name: "robotjs", pattern: /\brobotjs\b/i },
  { name: "nut.js", pattern: /\b(@nut-tree|nut\.js)\b/i },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "http upload", pattern: /\bXMLHttpRequest\b/ },
  { name: "getUserMedia", pattern: /\bgetUserMedia\b/ },
  { name: "AVCapture", pattern: /\bAVCapture\b/ },
  { name: "setInterval capture", pattern: /\bsetInterval\s*\([^)]*capture/i },
] as const;

function stripCommentsAndStrings(source: string): string {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  out = out.replace(/(^|[^:])\/\/.*$/gm, "$1");
  out = out.replace(/`(?:\\.|[^`\\])*`/g, '""');
  out = out.replace(/"(?:\\.|[^"\\])*"/g, '""');
  out = out.replace(/'(?:\\.|[^'\\])*'/g, '""');
  return out;
}

async function walkFiles(dir: string, exts: string[]): Promise<string[]> {
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
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "build") {
        continue;
      }
      out.push(...(await walkFiles(full, exts)));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

export interface MacOSNativeAuditReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
  notes: string[];
}

export async function runMacOSNativeAudit(): Promise<MacOSNativeAuditReport> {
  const files = [
    ...(await walkFiles(path.join(ROOT, "src/platform/macos"), [".ts", ".mm", ".m", ".h"])),
    path.join(ROOT, "binding.gyp"),
  ];
  const failures: string[] = [];
  const notes: string[] = [];

  for (const file of files) {
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    const code = stripCommentsAndStrings(raw);
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    for (const { name, pattern } of FORBIDDEN) {
      if (pattern.test(code)) {
        failures.push(`${rel}: forbidden pattern "${name}"`);
      }
    }
    // Extra: process.kill in TS
    if (rel.endsWith(".ts") && /\b(?:process\.)?kill\s*\(/.test(code)) {
      failures.push(`${rel}: forbidden pattern "kill("`);
    }
  }

  notes.push("Phase 13: N-API addon uses AppKit / CoreGraphics / IOKit / ImageIO.");
  notes.push("No shell, AppleScript, force-kill, CGEvent injection, or media capture devices.");
  notes.push("Graceful terminate only ([NSRunningApplication terminate]).");

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
  runMacOSNativeAudit().then((report) => {
    console.log(`macOS native audit — scanned ${report.scannedFiles} files`);
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) console.log("macOS native audit PASSED.");
    else {
      console.error("macOS native audit FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
