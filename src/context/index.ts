export type {
  DomainStatus,
  ContextSnapshot,
  ContextQueryKind,
  ContextTiming,
  ContextServiceResult,
  ContextAuditEntry,
  ContextAuditSink,
  ContextSystemInfo,
  ContextApplicationsInfo,
  ContextScreenInfo,
  ContextActivityInfo,
  ContextPresenceInfo,
  ContextFilesInfo,
  ContextMemoryInfo,
  ContextSophieSignals,
} from "./types.js";

export type {
  EnvironmentContext,
  EnvironmentChange,
  EnvironmentChangeType,
  EnvironmentTiming,
  EnvironmentSnapshotResult,
  ContextFreshness,
  EnvAvailability,
  FreshnessStatus,
  UserActivityLevel,
  AudioCapabilityKind,
  CursorContext,
  AudioContext,
  FocusedWindowContext,
} from "./EnvironmentContext.js";
export {
  emptyEnvironment,
  computeFreshness,
  classifyActivityLevel,
  unionBounds,
  ENVIRONMENT_LIMITS,
} from "./EnvironmentContext.js";
export {
  CursorProximityPolicy,
  computeCursorMotion,
  emptyCursorContext,
  mapMouseToDisplay,
  CURSOR_DEFAULTS,
} from "./CursorContext.js";
export type { CursorCoordinateSpace, CursorMotionResult } from "./CursorContext.js";
export { CursorMotionTracker } from "./CursorMotionTracker.js";
export {
  emptyFocusedWindowContext,
  compareFocusWindows,
} from "./FocusedWindowContext.js";
export { emptyAudioContext } from "./AudioContext.js";
export type { PlaybackState } from "./AudioContext.js";
export type { CursorReader, FocusReader } from "./EnvironmentObservation.js";
export { EnvironmentChangeTracker } from "./EnvironmentChangeTracker.js";
export {
  buildEnvironmentScenarios,
  simulateEnvironment,
  runEnvironmentSimulation,
} from "./EnvironmentSimulator.js";
export type {
  EnvironmentSimScenario,
  EnvironmentSimReport,
} from "./EnvironmentSimulator.js";

export { ContextService } from "./ContextService.js";
export type { ContextServiceOptions } from "./ContextService.js";
export { ContextFormatter } from "./ContextFormatter.js";
export { MemoryContextAuditLog } from "./ContextAuditLog.js";
