/**
 * Phase 9 LLM / intent security audit.
 * Scans src/ai and related tools (comments/strings stripped).
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
  { name: "eval(", pattern: /\beval\s*\(/ },
  { name: "Function(", pattern: /\bFunction\s*\(/ },
  { name: "new Function", pattern: /\bnew\s+Function\b/ },
  { name: "robotjs", pattern: /\brobotjs\b/i },
  { name: "nut.js", pattern: /\b(@nut-tree|nut\.js)\b/i },
  { name: "CGEvent", pattern: /\bCGEvent\b/ },
  { name: "getUserMedia", pattern: /\bgetUserMedia\b/ },
  { name: "execute(command)", pattern: /\bexecute\s*\(\s*command\b/i },
  { name: "runCommand", pattern: /\brunCommand\b/ },
  { name: "shellCommand", pattern: /\bshellCommand\b/ },
] as const;

/** fetch is only allowed in OllamaLLMProvider (configured endpoint). */
const FETCH_ALLOWED = "src/ai/OllamaLLMProvider.ts";

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

export interface LlmAuditReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
  notes: string[];
}

export async function runLlmAudit(): Promise<LlmAuditReport> {
  const files = [
    ...(await walkTs(path.join(ROOT, "src/ai"))),
    ...(await walkTs(path.join(ROOT, "src/tools"))).filter((f) =>
      /intent/i.test(path.basename(f)),
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
    if (/\bfetch\s*\(/.test(code) && rel !== FETCH_ALLOWED) {
      failures.push(`${rel}: fetch only allowed in ${FETCH_ALLOWED}`);
    }
  }

  // Ollama provider must not hardcode non-loopback cloud hosts as default.
  const ollamaPath = path.join(ROOT, "src/ai/OllamaLLMProvider.ts");
  const ollamaSrc = await fs.readFile(ollamaPath, "utf8");
  if (!ollamaSrc.includes("127.0.0.1:11434")) {
    failures.push("OllamaLLMProvider: default loopback URL missing");
  }
  if (/api\.openai\.com|anthropic\.com|googleapis\.com/i.test(ollamaSrc)) {
    failures.push("OllamaLLMProvider: cloud LLM host detected");
  }

  const pkg = JSON.parse(
    await fs.readFile(path.join(ROOT, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    failures.push("package.json: runtime dependencies must remain empty");
  }

  notes.push("Phase 9: LLM understands only — never executes.");
  notes.push("fetch allowed solely in OllamaLLMProvider for configured URL.");
  notes.push("No mandatory Ollama package dependency.");

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
  runLlmAudit().then((report) => {
    console.log(`LLM audit — scanned ${report.scannedFiles} files`);
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) {
      console.log("LLM audit PASSED.");
    } else {
      console.error("LLM audit FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
