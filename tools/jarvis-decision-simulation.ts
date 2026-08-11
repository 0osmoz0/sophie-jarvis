/**
 * Phase 18 — DecisionEngine SIMULATION (5000 scenarios).
 * Results are explicitly MODE: SIMULATION — not real decisions.
 */
import {
  DecisionSimulator,
  buildSyntheticScenarios,
} from "../src/decision/index.js";

async function main(): Promise<void> {
  console.log("\n=== JARVIS Decision Phase 18 — SIMULATION ===\n");
  console.log("MODE: SIMULATION (synthetic traffic)\n");

  const scenarios = buildSyntheticScenarios(5_000);
  const report = new DecisionSimulator().run(scenarios);

  console.log("SIMULATION RESULTS");
  console.log("------------------");
  console.log(`mode: ${report.mode}`);
  console.log(`total: ${report.total}`);
  console.log(
    `decision_distribution: ${JSON.stringify(report.decision_distribution)}`,
  );
  console.log(
    `confidence_distribution: ${JSON.stringify(report.confidence_distribution)}`,
  );
  console.log(`clarification_rate: ${report.clarification_rate.toFixed(3)}`);
  console.log(`refusal_rate: ${report.refusal_rate.toFixed(3)}`);
  console.log(`no_action_rate: ${report.no_action_rate.toFixed(3)}`);
  console.log(
    `action_candidate_rate: ${report.action_candidate_rate.toFixed(3)}`,
  );
  console.log(`contradiction_rate: ${report.contradiction_rate.toFixed(3)}`);
  console.log(`memory_usage_rate: ${report.memory_usage_rate.toFixed(3)}`);
  console.log(`context_usage_rate: ${report.context_usage_rate.toFixed(3)}`);
  console.log(`averageDecisionMs: ${report.averageDecisionMs.toFixed(3)}`);
  console.log(`p95DecisionMs: ${report.p95DecisionMs.toFixed(3)}`);
  console.log(`maxDecisionMs: ${report.maxDecisionMs.toFixed(3)}`);
  console.log("\nScale checkpoints (SIMULATION):");
  for (const [n, m] of Object.entries(report.scaleCheckpoints)) {
    console.log(
      `  n=${n} avg=${m.avg.toFixed(3)}ms p95=${m.p95.toFixed(3)}ms max=${m.max.toFixed(3)}ms`,
    );
  }
  console.log("\nMODE: SIMULATION\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
