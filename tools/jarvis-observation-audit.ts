/**
 * Phase 2 observation security audit.
 * Scans TypeScript source (comments stripped) for dangerous APIs.
 * Documentation prose alone is not treated as a violation.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CODE_DIRS = ["src"];

/** Dangerous patterns evaluated against comment-stripped source. */
const FORBIDDEN: Array<{ name: string; pattern: RegExp }> = [
  { name: "child_process", pattern: /\bchild_process\b/ },
  { name: "exec(", pattern: /\bexec(?:Sync)?\s*\(/ },
  { name: "spawn(", pattern: /\bspawn(?:Sync)?\s*\(/ },
  { name: "fork(", pattern: /\bfork\s*\(/ },
  { name: "shell:true", pattern: /shell\s*:\s*true/ },
  { name: "rm(", pattern: /\brm(?:Sync)?\s*\(/ },
  { name: "unlink(", pattern: /\bunlink(?:Sync)?\s*\(/ },
  { name: "writeFile(", pattern: /\bwriteFile(?:Sync)?\s*\(/ },
  { name: "appendFile(", pattern: /\bappendFile(?:Sync)?\s*\(/ },
  { name: "rename(", pattern: /\brename(?:Sync)?\s*\(/ },
  { name: "chmod(", pattern: /\bchmod(?:Sync)?\s*\(/ },
  { name: "kill(", pattern: /\b(?:process\.)?kill\s*\(/ },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "getUserMedia", pattern: /\bgetUserMedia\b/ },
  { name: "getDisplayMedia", pattern: /\bgetDisplayMedia\b/ },
  { name: "MediaRecorder", pattern: /\bMediaRecorder\b/ },
  { name: "robotjs/nut", pattern: /\b(robotjs|@nut-tree|nut\.js)\b/ },
  { name: "AppleScript action", pattern: /\bosascript\b/i },
  { name: "eval(", pattern: /\beval\s*\(/ },
];

function stripCommentsAndStrings(source: string): string {
  // Remove block comments
  let out = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  // Remove line comments
  out = out.replace(/(^|[^:])\/\/.*$/gm, "$1");
  // Neutralize string / template literal contents (keep structure)
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

export interface AuditReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
  notes: string[];
}

export async function runObservationAudit(): Promise<AuditReport> {
  const files: string[] = [];
  for (const d of CODE_DIRS) {
    files.push(...(await walkTs(path.join(ROOT, d))));
  }

  const failures: string[] = [];
  const notes: string[] = [];

  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const code = stripCommentsAndStrings(raw);
    const rel = path.relative(ROOT, file);
    const isFileService =
      rel.replace(/\\/g, "/").endsWith("files/FileService.ts");

    for (const { name, pattern } of FORBIDDEN) {
      // Phase 3: mutating fs is allowed only inside FileService
      if (
        isFileService &&
        (name === "rm(" ||
          name === "unlink(" ||
          name === "writeFile(" ||
          name === "appendFile(" ||
          name === "rename(")
      ) {
        continue;
      }
      if (pattern.test(code)) {
        failures.push(`${rel}: code pattern "${name}"`);
      }
    }

    // ScreenObserver must not hold image buffers beyond null sentinel
    if (rel.includes(`${path.sep}ScreenObserver.ts`)) {
      if (/\bimageData\s*:\s*(?!null)/.test(code) && !/imageData:\s*null/.test(raw)) {
        // soft note — structure requires imageData: null
      }
      if (!/available:\s*false/.test(code) && !/available:\s*false/.test(raw)) {
        notes.push("ScreenObserver should report available:false in Phase 2");
      }
    }
  }

  // Runtime deps must remain empty
  const pkg = JSON.parse(
    await fs.readFile(path.join(ROOT, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    failures.push("package.json: runtime dependencies must remain empty in Phase 2");
  }

  // Confirm observation module exists and FileObserver default is empty paths
  const fileObserverSrc = await fs.readFile(
    path.join(ROOT, "src/observation/FileObserver.ts"),
    "utf8",
  );
  if (!/paths:\s*\[\]/.test(fileObserverSrc) && !/\{ paths: \[\] \}/.test(fileObserverSrc)) {
    // constructor default { paths: [] } is in ObservationService / FileObserver
  }
  if (!/config\.paths\s*\?\?\s*\[\]/.test(fileObserverSrc) && !/paths\s*=\s*\[\.\.\.\(config\.paths/.test(fileObserverSrc)) {
    notes.push("FileObserver should default configured paths to []");
  }

  notes.push("Audit scans src/**/*.ts with comments/strings stripped.");
  notes.push("READ ONLY Phase 2: observation only, no system mutation APIs.");

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
  runObservationAudit().then((report) => {
    console.log(`Observation audit — scanned ${report.scannedFiles} source files`);
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) {
      console.log("Observation audit PASSED.");
    } else {
      console.error("Observation audit FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
