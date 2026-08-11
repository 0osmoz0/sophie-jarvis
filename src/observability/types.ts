/**
 * Phase 21 — Observability types (metadata only, no authority).
 */

export type PipelineStage =
  | "INPUT"
  | "CONVERSATION"
  | "UNDERSTAND"
  | "VALIDATION"
  | "REFERENCE"
  | "DECISION"
  | "PLANNING"
  | "PERMISSION"
  | "CONFIRMATION"
  | "EXECUTION"
  | "RESPONSE"
  | "COMPLETE"
  | "ERROR";

export type StageStatus =
  | "OK"
  | "SKIPPED"
  | "WAITING"
  | "FAILED"
  | "DENIED"
  | "UNAVAILABLE"
  | "FALLBACK";

export interface TraceStageRecord {
  stage: PipelineStage;
  status: StageStatus;
  latencyMs: number | null;
  category?: string | null;
  code?: string | null;
  /** Non-sensitive diagnostic detail (never user content / secrets). */
  detail?: string | null;
}

export interface PipelineTraceSnapshot {
  requestId: string;
  startedAt: string;
  completedAt: string | null;
  stages: TraceStageRecord[];
  totalMs: number | null;
  llmUnderstandCalls: number;
  llmResponseCalls: number;
  errorCategory?: string | null;
  errorCode?: string | null;
}

export interface LatencyBucketStats {
  count: number;
  sumMs: number;
  maxMs: number;
  /** Reservoir of recent samples for p50/p95 (bounded). */
  samples: number[];
}

export interface ProductionMetricsSnapshot {
  requests: number;
  successes: number;
  errors: number;
  clarifications: number;
  refusals: number;
  actions: number;
  cancelled: number;
  timeouts: number;
  llmUnavailable: number;
  llmInvalid: number;
  permissionDenied: number;
  executionFailed: number;
  responseFallback: number;
  concurrentRejected: number;
  latency: {
    understand: LatencyBucketStats;
    decision: LatencyBucketStats;
    planning: LatencyBucketStats;
    execution: LatencyBucketStats;
    response: LatencyBucketStats;
    total: LatencyBucketStats;
  };
}

export const OBSERVABILITY_LIMITS = {
  maxTraceEntries: 500,
  maxAuditEntries: 1_000,
  maxLatencySamples: 256,
  maxDetailChars: 80,
} as const;
