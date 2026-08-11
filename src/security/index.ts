export type {
  SecuritySignal,
  SecuritySignalCategory,
  SecuritySeverity,
  SecurityObservationInput,
  SecurityBaselineSnapshot,
  ThreatAssessment,
  SecurityAlert,
  SecurityServiceStatus,
  SecurityAssessResult,
  SecurityTiming,
  SecurityAuditEntry,
  SecurityAuditSink,
  SecurityPresenceBucket,
  SecurityEvidenceItem,
} from "./types.js";

export {
  SECURITY_DISCLAIMER,
  SEVERITY_ORDER,
} from "./types.js";

export { createSecuritySignal, appKey } from "./SecuritySignal.js";
export { SecurityBaseline, observationToBaseline } from "./SecurityBaseline.js";
export {
  SecuritySignalCollector,
  classifyPresence,
} from "./SecuritySignalCollector.js";
export { ThreatAssessmentEngine } from "./ThreatAssessmentEngine.js";
export type { SecuritySequence } from "./ThreatAssessmentEngine.js";
export { alertsFromAssessment, formatAlertMessage } from "./SecurityAlert.js";
export { MemorySecurityAuditLog } from "./SecurityAuditLog.js";
export { SecurityService } from "./SecurityService.js";
export type {
  SecurityServiceOptions,
  SecurityAssessOptions,
} from "./SecurityService.js";
export {
  contextSnapshotToSecurityObservation,
  contextSnapshotToSecuritySources,
} from "./fromContext.js";
export { runSecuritySimulation } from "./SecuritySimulator.js";
export type {
  SimulationStats,
  SimulationScenarioKind,
} from "./SecuritySimulator.js";

export type { SecurityEvent, SecurityEventSeverity } from "./SecurityEvent.js";
export { createSecurityEvent } from "./SecurityEvent.js";

export {
  SecurityMonitor,
  formatMonitorStatus,
} from "./SecurityMonitor.js";
export { SecurityAlertDeduper, fingerprintAlert } from "./SecurityAlertDeduper.js";
export { SeverityStabilizer } from "./SeverityStabilizer.js";
export {
  DEFAULT_SECURITY_MONITOR_CONFIG,
  clampMonitorInterval,
  defaultSources,
  emptyTiming,
} from "./monitorTypes.js";
export type {
  SecurityMonitorRunStatus,
  SecurityMonitorConfig,
  SecurityMonitorState,
  SecurityMonitorTiming,
  SecurityMonitorTickResult,
  SecurityMonitorStatusReport,
  SecurityMonitorOptions,
  SecuritySourceReport,
  SecuritySourceAvailability,
  DedupedSecurityAlert,
} from "./monitorTypes.js";
