/**
 * Phase 19 — response SIMULATION (synthetic).
 * MODE: SIMULATION — not real user performance.
 */
import { ResponseSimulator } from "../src/response/index.js";

async function main(): Promise<void> {
  console.log("\n=== JARVIS Response Phase 19 — SIMULATION ===\n");
  console.log("MODE: SIMULATION (synthetic traffic)\n");

  const report = await new ResponseSimulator().run(5_000);
  console.log("SIMULATION RESULTS");
  console.log("------------------");
  console.log(`mode: ${report.mode}`);
  console.log(`total: ${report.total}`);
  console.log(
    `category_distribution: ${JSON.stringify(report.category_distribution)}`,
  );
  console.log(`llm_usage_rate: ${report.llm_usage_rate.toFixed(3)}`);
  console.log(`averageMs: ${report.averageMs.toFixed(3)}`);
  console.log(`p50Ms: ${report.p50Ms.toFixed(3)}`);
  console.log(`p95Ms: ${report.p95Ms.toFixed(3)}`);
  console.log(`maxMs: ${report.maxMs.toFixed(3)}`);
  console.log(`policyAvgMs: ${report.policyAvgMs.toFixed(3)}`);
  console.log(`validationAvgMs: ${report.validationAvgMs.toFixed(3)}`);
  console.log(`formattingAvgMs: ${report.formattingAvgMs.toFixed(3)}`);
  console.log(`llmAvgMs: ${report.llmAvgMs.toFixed(3)}`);
  console.log("\nScale checkpoints (SIMULATION):");
  for (const [n, m] of Object.entries(report.scaleCheckpoints)) {
    console.log(
      `  n=${n} avg=${m.avg.toFixed(3)} p50=${m.p50.toFixed(3)} p95=${m.p95.toFixed(3)} max=${m.max.toFixed(3)}`,
    );
  }
  console.log("\nMODE: SIMULATION\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
