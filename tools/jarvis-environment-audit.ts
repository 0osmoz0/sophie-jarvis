/**
 * Phase 24 — Environment structural audit.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeFreshness,
  emptyEnvironment,
  runEnvironmentSimulation,
} from "../src/context/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  console.log("\n=== JARVIS Environment — Audit ===\n");
  const failures: string[] = [];

  const env = emptyEnvironment();
  if (env.cursor.available !== "UNAVAILABLE") {
    failures.push("cursor must be UNAVAILABLE by default");
  }
  if (env.audio.playing === true) {
    failures.push("must never invent audio playing");
  }
  if (env.session.locked === false && env.session.available === "UNKNOWN") {
    failures.push("UNKNOWN session must not coerce locked=false inconsistently");
  }

  const stale = computeFreshness(Date.now() - 60_000, Date.now());
  if (stale.status !== "STALE") failures.push("stale freshness");

  const sim = runEnvironmentSimulation(100);
  if (sim.report.mode !== "SIMULATION") failures.push("sim mode");
  if (sim.report.total !== 100) failures.push("sim total");

  // Files exist
  for (const f of [
    "src/context/EnvironmentContext.ts",
    "src/context/EnvironmentChangeTracker.ts",
    "src/context/EnvironmentSimulator.ts",
    "docs/JARVIS_ENVIRONMENT.md",
  ]) {
    try {
      await fs.access(path.join(ROOT, f));
      console.log(`  · ${f}`);
    } catch {
      failures.push(`missing ${f}`);
    }
  }

  // No setInterval in Environment* files
  for (const f of [
    "EnvironmentContext.ts",
    "EnvironmentChangeTracker.ts",
    "EnvironmentSimulator.ts",
  ]) {
    const raw = await fs.readFile(
      path.join(ROOT, "src/context", f),
      "utf8",
    );
    if (/\bsetInterval\s*\(/.test(raw)) {
      failures.push(`${f} has setInterval`);
    }
  }

  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("  ✓ environment audit clean\n");
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
