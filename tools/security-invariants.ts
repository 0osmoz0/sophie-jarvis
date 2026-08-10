/**
 * Phase 1 security invariants — static scan of the source tree.
 * Ensures no dangerous capabilities were introduced.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["src", "tools"];

/** Patterns that must not appear in Phase 1 application code. */
const FORBIDDEN_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "child_process", pattern: /\bchild_process\b/ },
  { name: "exec(", pattern: /\bexec\s*\(/ },
  { name: "execSync(", pattern: /\bexecSync\s*\(/ },
  { name: "spawn(", pattern: /\bspawn\s*\(/ },
  { name: "spawnSync(", pattern: /\bspawnSync\s*\(/ },
  { name: "fork(", pattern: /\bfork\s*\(/ },
  { name: "eval(", pattern: /\beval\s*\(/ },
  { name: "Function constructor", pattern: /\bnew\s+Function\s*\(/ },
  { name: "shell:true", pattern: /shell\s*:\s*true/ },
  { name: "/bin/sh", pattern: /\/bin\/sh/ },
  { name: "cmd.exe", pattern: /cmd\.exe/i },
  { name: "powershell", pattern: /\bpowershell\b/i },
  { name: "navigator.mediaDevices", pattern: /navigator\.mediaDevices/ },
  { name: "getUserMedia", pattern: /\bgetUserMedia\b/ },
  { name: "webkitGetUserMedia", pattern: /\bwebkitGetUserMedia\b/ },
  { name: "MediaRecorder", pattern: /\bMediaRecorder\b/ },
  { name: "camera access", pattern: /\b(enumerateDevices|getDisplayMedia)\b/ },
  { name: "microphone", pattern: /\bmicrophone\b/i },
  { name: "Robot / nut.js keyboard", pattern: /\b(@nut-tree|robotjs|nut\.js)\b/i },
  { name: "net socket client", pattern: /\bfrom\s+["']node:net["']/ },
  { name: "http request", pattern: /\bfrom\s+["']node:http["']/ },
  { name: "https request", pattern: /\bfrom\s+["']node:https["']/ },
  { name: "fetch to external", pattern: /\bfetch\s*\(/ },
  { name: "axios", pattern: /\baxios\b/ },
  { name: "openai", pattern: /\bopenai\b/i },
  { name: "ollama", pattern: /\bollama\b/i },
  { name: "fs writeFile", pattern: /\bwriteFile(?:Sync)?\s*\(/ },
  { name: "fs unlink", pattern: /\bunlink(?:Sync)?\s*\(/ },
  { name: "fs rm", pattern: /\brm(?:Sync)?\s*\(/ },
  { name: "fs mkdir write", pattern: /\bappendFile(?:Sync)?\s*\(/ },
  { name: "SMS / telephony", pattern: /\b(twilio|tel:|sms:|sendSMS)\b/i },
  { name: "Gmail API", pattern: /\bgmail\b/i },
  {
    name: "Sophie repo import",
    pattern:
      /\b(?:import|require)\b[\s\S]{0,80}\b(BehaviorBrain|SophieAPI|SophieEventBus)\b/,
  },
];

/** Files that are allowed to mention certain patterns (tests/docs scanners). */
const ALLOWLIST: Array<{ fileSubstring: string; patternNames: string[] }> = [
  {
    fileSubstring: "security-invariants.ts",
    patternNames: [
      "child_process",
      "exec(",
      "execSync(",
      "spawn(",
      "spawnSync(",
      "fork(",
      "eval(",
      "Function constructor",
      "shell:true",
      "/bin/sh",
      "cmd.exe",
      "powershell",
      "navigator.mediaDevices",
      "getUserMedia",
      "webkitGetUserMedia",
      "MediaRecorder",
      "camera access",
      "microphone",
      "Robot / nut.js keyboard",
      "net socket client",
      "http request",
      "https request",
      "fetch to external",
      "axios",
      "openai",
      "ollama",
      "fs writeFile",
      "fs unlink",
      "fs rm",
      "fs mkdir write",
      "SMS / telephony",
      "Gmail API",
      "Sophie repo import",
    ],
  },
  {
    fileSubstring: "jarvis-core-smoke.ts",
    patternNames: ["microphone", "Sophie repo import", "openai", "ollama"],
  },
  {
    fileSubstring: "JARVIS_ARCHITECTURE.md",
    patternNames: [
      "microphone",
      "openai",
      "ollama",
      "Gmail API",
      "Sophie repo import",
      "child_process",
      "exec(",
      "spawn(",
      "eval(",
      "fetch to external",
    ],
  },
  {
    fileSubstring: "jarvis-core-phase1-report.txt",
    patternNames: [
      "microphone",
      "openai",
      "ollama",
      "Gmail API",
      "Sophie repo import",
      "child_process",
      "exec(",
      "spawn(",
      "eval(",
      "fetch to external",
      "camera access",
    ],
  },
  {
    fileSubstring: "JARVIS_OBSERVATION.md",
    patternNames: [
      "microphone",
      "camera access",
      "child_process",
      "exec(",
      "spawn(",
      "eval(",
      "fetch to external",
      "openai",
      "ollama",
      "Gmail API",
      "SMS / telephony",
      "fs writeFile",
      "fs unlink",
      "fs rm",
    ],
  },
  {
    fileSubstring: "jarvis-observation-audit.ts",
    patternNames: [
      "child_process",
      "exec(",
      "execSync(",
      "spawn(",
      "spawnSync(",
      "fork(",
      "eval(",
      "Function constructor",
      "shell:true",
      "/bin/sh",
      "cmd.exe",
      "powershell",
      "navigator.mediaDevices",
      "getUserMedia",
      "webkitGetUserMedia",
      "MediaRecorder",
      "camera access",
      "microphone",
      "Robot / nut.js keyboard",
      "net socket client",
      "http request",
      "https request",
      "fetch to external",
      "axios",
      "openai",
      "ollama",
      "fs writeFile",
      "fs unlink",
      "fs rm",
      "fs mkdir write",
      "SMS / telephony",
      "Gmail API",
      "Sophie repo import",
    ],
  },
  {
    fileSubstring: "jarvis-observation-smoke.ts",
    patternNames: ["microphone", "openai", "ollama"],
  },
  {
    fileSubstring: "jarvis-observation-phase2-report.txt",
    patternNames: [
      "microphone",
      "openai",
      "ollama",
      "Gmail API",
      "Sophie repo import",
      "child_process",
      "exec(",
      "spawn(",
      "eval(",
      "fetch to external",
      "camera access",
      "SMS / telephony",
      "fs writeFile",
      "fs unlink",
      "fs rm",
    ],
  },
  {
    fileSubstring: "FileService.ts",
    patternNames: [
      "fs writeFile",
      "fs unlink",
      "fs rm",
      "fs mkdir write",
    ],
  },
  {
    fileSubstring: "jarvis-file-control-audit.ts",
    patternNames: [
      "child_process",
      "exec(",
      "execSync(",
      "spawn(",
      "spawnSync(",
      "fork(",
      "eval(",
      "Function constructor",
      "shell:true",
      "/bin/sh",
      "cmd.exe",
      "powershell",
      "navigator.mediaDevices",
      "getUserMedia",
      "webkitGetUserMedia",
      "MediaRecorder",
      "camera access",
      "microphone",
      "Robot / nut.js keyboard",
      "net socket client",
      "http request",
      "https request",
      "fetch to external",
      "axios",
      "openai",
      "ollama",
      "fs writeFile",
      "fs unlink",
      "fs rm",
      "fs mkdir write",
      "SMS / telephony",
      "Gmail API",
      "Sophie repo import",
    ],
  },
  {
    fileSubstring: "jarvis-file-control-smoke.ts",
    patternNames: [
      "fs writeFile",
      "fs unlink",
      "fs rm",
      "fs mkdir write",
      "microphone",
      "openai",
      "ollama",
    ],
  },
  {
    fileSubstring: "JARVIS_FILE_CONTROL.md",
    patternNames: [
      "microphone",
      "camera access",
      "child_process",
      "exec(",
      "spawn(",
      "eval(",
      "fetch to external",
      "openai",
      "ollama",
      "fs writeFile",
      "fs unlink",
      "fs rm",
      "SMS / telephony",
      "Gmail API",
    ],
  },
  {
    fileSubstring: "jarvis-file-control-phase3-report.txt",
    patternNames: [
      "microphone",
      "openai",
      "ollama",
      "Gmail API",
      "Sophie repo import",
      "child_process",
      "exec(",
      "spawn(",
      "eval(",
      "fetch to external",
      "camera access",
      "SMS / telephony",
      "fs writeFile",
      "fs unlink",
      "fs rm",
    ],
  },
  {
    fileSubstring: "jarvis-application-control-audit.ts",
    patternNames: [
      "child_process",
      "exec(",
      "execSync(",
      "spawn(",
      "spawnSync(",
      "fork(",
      "eval(",
      "Function constructor",
      "shell:true",
      "/bin/sh",
      "cmd.exe",
      "powershell",
      "navigator.mediaDevices",
      "getUserMedia",
      "webkitGetUserMedia",
      "MediaRecorder",
      "camera access",
      "microphone",
      "Robot / nut.js keyboard",
      "net socket client",
      "http request",
      "https request",
      "fetch to external",
      "axios",
      "openai",
      "ollama",
      "fs writeFile",
      "fs unlink",
      "fs rm",
      "fs mkdir write",
      "SMS / telephony",
      "Gmail API",
      "Sophie repo import",
    ],
  },
  {
    fileSubstring: "jarvis-application-control-smoke.ts",
    patternNames: [
      "microphone",
      "openai",
      "ollama",
      "Robot / nut.js keyboard",
    ],
  },
  {
    fileSubstring: "JARVIS_APPLICATION_CONTROL.md",
    patternNames: [
      "microphone",
      "camera access",
      "child_process",
      "exec(",
      "spawn(",
      "eval(",
      "fetch to external",
      "openai",
      "ollama",
      "Robot / nut.js keyboard",
      "SMS / telephony",
      "Gmail API",
    ],
  },
  {
    fileSubstring: "jarvis-application-control-phase4-report.txt",
    patternNames: [
      "microphone",
      "openai",
      "ollama",
      "Gmail API",
      "Sophie repo import",
      "child_process",
      "exec(",
      "spawn(",
      "eval(",
      "fetch to external",
      "camera access",
      "SMS / telephony",
      "Robot / nut.js keyboard",
    ],
  },
  {
    fileSubstring: "jarvis-macos-backend-audit.ts",
    patternNames: [
      "child_process",
      "exec(",
      "execSync(",
      "spawn(",
      "spawnSync(",
      "fork(",
      "eval(",
      "Function constructor",
      "shell:true",
      "/bin/sh",
      "cmd.exe",
      "powershell",
      "navigator.mediaDevices",
      "getUserMedia",
      "webkitGetUserMedia",
      "MediaRecorder",
      "camera access",
      "microphone",
      "Robot / nut.js keyboard",
      "net socket client",
      "http request",
      "https request",
      "fetch to external",
      "axios",
      "openai",
      "ollama",
      "fs writeFile",
      "fs unlink",
      "fs rm",
      "fs mkdir write",
      "SMS / telephony",
      "Gmail API",
      "Sophie repo import",
    ],
  },
  {
    fileSubstring: "jarvis-macos-application-backend-smoke.ts",
    patternNames: ["microphone", "openai", "ollama", "Robot / nut.js keyboard"],
  },
  {
    fileSubstring: "jarvis-macos-native-phase5-report.txt",
    patternNames: [
      "microphone",
      "openai",
      "ollama",
      "Gmail API",
      "Sophie repo import",
      "child_process",
      "exec(",
      "spawn(",
      "eval(",
      "fetch to external",
      "camera access",
      "SMS / telephony",
      "Robot / nut.js keyboard",
    ],
  },
];

async function walk(dir: string): Promise<string[]> {
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
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".audit-cache") {
        continue;
      }
      out.push(...(await walk(full)));
    } else if (/\.(ts|tsx|js|mjs|cjs|md|txt)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function isAllowlisted(filePath: string, patternName: string): boolean {
  const rel = path.relative(ROOT, filePath);
  for (const rule of ALLOWLIST) {
    if (rel.includes(rule.fileSubstring) && rule.patternNames.includes(patternName)) {
      return true;
    }
  }
  return false;
}

export interface InvariantReport {
  ok: boolean;
  scannedFiles: number;
  failures: string[];
}

export async function runSecurityInvariants(): Promise<InvariantReport> {
  const files: string[] = [];
  for (const d of SCAN_DIRS) {
    files.push(...(await walk(path.join(ROOT, d))));
  }
  // Also scan docs
  files.push(...(await walk(path.join(ROOT, "docs"))));

  const failures: string[] = [];

  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    const rel = path.relative(ROOT, file);

    for (const { name, pattern } of FORBIDDEN_PATTERNS) {
      if (isAllowlisted(file, name)) continue;
      if (pattern.test(content)) {
        failures.push(`${rel}: forbidden pattern "${name}"`);
      }
    }
  }

  // package.json: no runtime deps that imply network/LLM/shell
  const pkgPath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    failures.push("package.json: Phase 1–2 must have zero runtime dependencies");
  }
  const forbiddenDeps = ["openai", "ollama", "axios", "node-fetch", "puppeteer", "playwright", "robotjs"];
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };
  for (const dep of forbiddenDeps) {
    if (allDeps[dep]) {
      failures.push(`package.json: forbidden dependency "${dep}"`);
    }
  }

  return {
    ok: failures.length === 0,
    scannedFiles: files.length,
    failures,
  };
}

// Allow direct execution
const isDirect =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  runSecurityInvariants().then((report) => {
    console.log(`Scanned ${report.scannedFiles} files`);
    if (report.ok) {
      console.log("All security invariants passed.");
    } else {
      console.error("Security invariant failures:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
