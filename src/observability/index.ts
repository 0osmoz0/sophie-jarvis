/**
 * Phase 21 — Observability façade (passive observation only).
 */

export type {
  PipelineStage,
  StageStatus,
  TraceStageRecord,
  PipelineTraceSnapshot,
  ProductionMetricsSnapshot,
  LatencyBucketStats,
} from "./types.js";
export { OBSERVABILITY_LIMITS } from "./types.js";

export {
  createJarvisError,
  sanitizeErrorMessage,
  categorizeRuntimeCode,
} from "./JarvisError.js";
export type { JarvisError, JarvisErrorCategory } from "./JarvisError.js";

export { ObservabilityPolicy } from "./ObservabilityPolicy.js";
export { ObservabilityAuditLog } from "./ObservabilityAuditLog.js";
export {
  PipelineTrace,
  formatPipelineTrace,
} from "./PipelineTrace.js";
export { PipelineTraceCollector } from "./PipelineTraceCollector.js";
export { PipelineMetrics } from "./PipelineMetrics.js";
