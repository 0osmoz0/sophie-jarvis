/**
 * Phase 24 — Environment privacy audit.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EnvironmentChangeTracker,
  emptyEnvironment,
} from "../src/context/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  console.log("\n=== JARVIS Environment — Privacy Audit ===\n");
  const failures: string[] = [];

  for (const f of [
    "EnvironmentContext.ts",
    "EnvironmentChangeTracker.ts",
    "EnvironmentSimulator.ts",
  ]) {
    const raw = await fs.readFile(path.join(ROOT, "src/context", f), "utf8");
    for (const bad of [
      { name: "screenshot auto", re: /captureDisplay|captureScreen|screenshot/i },
      { name: "OCR", re: /\bOCR\b|\btesseract\b/i },
      { name: "clipboard", re: /\bclipboard\b/i },
      { name: "keystroke", re: /\bkeystroke/i },
      { name: "audio buffer", re: /audioBuffer|getUserMedia|MediaRecorder/i },
    ]) {
      // Allow documentation of "no OCR" etc. in comments — strip comments first
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      if (bad.re.test(code)) {
        failures.push(`${f}: ${bad.name}`);
      }
    }
  }

  const tracker = new EnvironmentChangeTracker(8);
  for (let i = 0; i < 40; i++) {
    const e = emptyEnvironment(Date.now() + i);
    e.application.available = "AVAILABLE";
    e.application.active = {
      id: `a${i}`,
      name: `App${i}`,
      bundleId: null,
    };
    e.application.runningCount = 1;
    tracker.observe(e);
  }
  if (tracker.list().length > 8) {
    failures.push("unbounded change history");
  } else {
    console.log(`  · change history bounded (${tracker.list().length})`);
  }

  const dump = JSON.stringify(tracker.list());
  if (/password|secret|token=|Uint8Array|PNG/i.test(dump)) {
    failures.push("change log contains sensitive payload");
  } else {
    console.log("  · change log metadata-only");
  }

  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\n  ✓ environment privacy audit clean\n");
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
