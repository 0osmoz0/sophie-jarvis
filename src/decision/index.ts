export type {
  DecisionType,
  ConfidenceCategory,
  DecisionOrigin,
  DecisionEvidenceSource,
  DecisionEvidence,
  DecisionActionIntent,
  Decision,
  DecisionTiming,
  DecisionAuditEntry,
} from "./types.js";
export {
  DECISION_PRIORITY,
  ACTION_MIN_CONFIDENCE,
  confidenceCategory,
  clampConfidence,
} from "./types.js";

export {
  DecisionEngine,
  shouldConsultMemory,
} from "./DecisionEngine.js";
export type {
  DecisionInput,
  DecisionResult,
} from "./DecisionEngine.js";

export { DecisionPolicy } from "./DecisionPolicy.js";
export { DecisionValidator } from "./DecisionValidator.js";
export { DecisionExplanation } from "./DecisionExplanation.js";
export { ContradictionDetector } from "./ContradictionDetector.js";
export type {
  ContradictionInput,
  ContradictionResult,
} from "./ContradictionDetector.js";

export {
  MemoryDecisionAuditLog,
  toAuditEntry,
} from "./DecisionAuditLog.js";
export type { DecisionAuditSink } from "./DecisionAuditLog.js";

export {
  DecisionSimulator,
  buildSyntheticScenarios,
} from "./DecisionSimulator.js";
export type {
  DecisionSimulationScenario,
  DecisionSimulationReport,
} from "./DecisionSimulator.js";
