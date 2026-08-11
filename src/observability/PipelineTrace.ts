/**
 * Phase 21 — per-request pipeline trace (metadata only).
 */

import type {
  PipelineStage,
  PipelineTraceSnapshot,
  StageStatus,
  TraceStageRecord,
} from "./types.js";
import { ObservabilityPolicy } from "./ObservabilityPolicy.js";

export class PipelineTrace {
  readonly requestId: string;
  readonly startedAt: string;
  private readonly stages: TraceStageRecord[] = [];
  private completedAt: string | null = null;
  private totalMs: number | null = null;
  private llmUnderstandCalls = 0;
  private llmResponseCalls = 0;
  private errorCategory: string | null = null;
  private errorCode: string | null = null;
  private readonly policy = new ObservabilityPolicy();
  private readonly startedMs: number;

  constructor(requestId: string, now: () => number = () => Date.now()) {
    this.requestId = requestId;
    this.startedMs = now();
    this.startedAt = new Date(this.startedMs).toISOString();
  }

  record(
    stage: PipelineStage,
    status: StageStatus,
    options?: {
      latencyMs?: number | null;
      category?: string | null;
      code?: string | null;
      detail?: string | null;
    },
  ): void {
    const detail = options?.detail
      ? this.policy.allowDetail("detail", options.detail)
      : null;
    this.stages.push({
      stage,
      status,
      latencyMs:
        options?.latencyMs === undefined ? null : options.latencyMs,
      category: options?.category ?? null,
      code: options?.code ?? null,
      detail,
    });
  }

  setLlmCalls(understand: number, response: number): void {
    this.llmUnderstandCalls = understand;
    this.llmResponseCalls = response;
  }

  setError(category: string, code: string | null): void {
    this.errorCategory = category;
    this.errorCode = code;
  }

  complete(totalMs: number | null, now: () => number = () => Date.now()): void {
    this.totalMs = totalMs;
    this.completedAt = new Date(now()).toISOString();
  }

  snapshot(): PipelineTraceSnapshot {
    return {
      requestId: this.requestId,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      stages: this.stages.map((s) => ({ ...s })),
      totalMs: this.totalMs,
      llmUnderstandCalls: this.llmUnderstandCalls,
      llmResponseCalls: this.llmResponseCalls,
      errorCategory: this.errorCategory,
      errorCode: this.errorCode,
    };
  }
}

export function formatPipelineTrace(trace: PipelineTraceSnapshot): string {
  const lines = [
    "=== JARVIS REQUEST TRACE ===",
    "",
    "request:",
    trace.requestId,
    "",
  ];
  for (const s of trace.stages) {
    lines.push(s.stage);
    lines.push("-".repeat(Math.min(12, s.stage.length)));
    lines.push(`status: ${s.status}`);
    if (s.latencyMs != null) lines.push(`latency: ${s.latencyMs}ms`);
    if (s.category) lines.push(`category: ${s.category}`);
    if (s.code) lines.push(`code: ${s.code}`);
    if (s.stage === "UNDERSTAND") {
      lines.push(`calls: ${trace.llmUnderstandCalls}`);
    }
    if (s.stage === "RESPONSE") {
      lines.push(`calls: ${trace.llmResponseCalls}`);
    }
    lines.push("");
  }
  lines.push("TOTAL");
  lines.push("-----");
  lines.push(
    trace.totalMs != null ? `${trace.totalMs.toFixed(1)}ms` : "unavailable",
  );
  if (trace.errorCategory) {
    lines.push("");
    lines.push(`error: ${trace.errorCategory}${trace.errorCode ? ` (${trace.errorCode})` : ""}`);
  }
  return lines.join("\n");
}
