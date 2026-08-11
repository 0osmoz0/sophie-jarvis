/**
 * Phase 24 — Environment SIMULATION (5000 snapshots).
 * MODE: SIMULATION — not real observations.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runEnvironmentSimulation } from "../src/context/index.js";

const N = 5_000;

async function main(): Promise<void> {
  console.log("\n=== JARVIS ENVIRONMENT SIMULATION — PHASE 24 ===\n");
  console.log("MODE: SIMULATION\n");

  const { report, changes } = runEnvironmentSimulation(N);
  console.log(`total: ${report.total}`);
  console.log(`distribution: ${JSON.stringify(report.distribution)}`);
  console.log(`changeTypes: ${JSON.stringify(report.changeTypes)}`);
  console.log(`staleCount: ${report.staleCount}`);
  console.log(`unknownSessionCount: ${report.unknownSessionCount}`);
  console.log(`cursorUnavailableCount: ${report.cursorUnavailableCount}`);
  console.log(`audioUnavailableCount: ${report.audioUnavailableCount}`);
  console.log(`changes emitted: ${changes.length}`);
  console.log("\nMODE: SIMULATION");
  console.log("(Synthetic environment traffic — not real observations)\n");
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
