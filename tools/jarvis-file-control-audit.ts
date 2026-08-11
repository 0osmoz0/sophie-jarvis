/**
 * Phase 3 file-control security audit.
 * Ensures mutating fs APIs live only in FileService; tools never import fs.
 * Comments/strings are stripped before matching.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MUTATING_FS = [
  { name: "writeFile(", pattern: /\bwriteFile(?:Sync)?\s*\(/ },
  { name: "appendFile(", pattern: /\bappendFile(?:Sync)?\s*\(/ },
  { name: "unlink(", pattern: /\bunlink(?:Sync)?\s*\(/ },
  { name: "rm(", pattern: /\brm(?:Sync)?\s*\(/ },
  { name: "rename(", pattern: /\brename(?:Sync)?\s*\(/ },
  { name: "copyFile(", pattern: /\bcopyFile(?:Sync)?\s*\(/ },
  { name: "chmod(", pattern: /\bchmod(?:Sync)?\s*\(/ },
] as const;

const GLOBAL_FORBIDDEN = [
  { name: "child_process", pattern: /\bchild_process\b/ },
  { name: "exec(", pattern: /\bexec(?:Sync)?\s*\(/ },
  { name: "spawn(", pattern: /\bspawn(?:Sync)?\s*\(/ },
  { name: "fork(", pattern: /\bfork\s*\(/ },
  { name: "shell:true", pattern: /shell\s*:\s*true/ },
  { name: "osascript", pattern: /\bosascript\b/i },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "eval(", pattern: /\beval\s*\(/ },
  { name: "getUserMedia", pattern: /\bgetUserMedia\b/ },
  { name: "getDisplayMedia", pattern: /\bgetDisplayMedia\b/ },
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

export interface FileControlAuditReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
  notes: string[];
}

export async function runFileControlAudit(): Promise<FileControlAuditReport> {
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
    const isFileService = rel === "src/files/FileService.ts";
    const isTool = rel.startsWith("src/tools/");

    for (const { name, pattern } of GLOBAL_FORBIDDEN) {
      if (pattern.test(code)) {
        failures.push(`${rel}: forbidden pattern "${name}"`);
      }
    }

    for (const { name, pattern } of MUTATING_FS) {
      if (!pattern.test(code)) continue;
      if (isFileService) continue;
      failures.push(`${rel}: mutating fs "${name}" must only appear in FileService`);
    }

    if (isTool && /from\s+["']node:fs(?:\/promises)?["']/.test(code)) {
      failures.push(`${rel}: tools must not import node:fs`);
    }

    if (isTool && /\bfs\.(writeFile|unlink|rename|rm|copyFile)\b/.test(code)) {
      failures.push(`${rel}: tools must not call fs mutating APIs directly`);
    }
  }

  const pkg = JSON.parse(
    await fs.readFile(path.join(ROOT, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    failures.push("package.json: runtime dependencies must remain empty");
  }

  notes.push("Mutating fs APIs allowed only in src/files/FileService.ts");
  notes.push("Tools must delegate all filesystem work to FileService");
  notes.push("Sophie has no direct FileService access");

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
  runFileControlAudit().then((report) => {
    console.log(`File-control audit — scanned ${report.scannedFiles} source files`);
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) {
      console.log("File-control audit PASSED.");
    } else {
      console.error("File-control audit FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
