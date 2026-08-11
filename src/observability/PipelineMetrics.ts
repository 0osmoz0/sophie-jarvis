/**
 * Phase 21 — bounded production metrics (metadata only).
 */

import {
  OBSERVABILITY_LIMITS,
  type LatencyBucketStats,
  type ProductionMetricsSnapshot,
} from "./types.js";

function emptyBucket(): LatencyBucketStats {
  return { count: 0, sumMs: 0, maxMs: 0, samples: [] };
}

function recordLatency(
  bucket: LatencyBucketStats,
  ms: number | null | undefined,
): void {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return;
  bucket.count += 1;
  bucket.sumMs += ms;
  if (ms > bucket.maxMs) bucket.maxMs = ms;
  bucket.samples.push(ms);
  while (bucket.samples.length > OBSERVABILITY_LIMITS.maxLatencySamples) {
    bucket.samples.shift();
  }
}

function percentile(samples: number[], p: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

export class PipelineMetrics {
  private snapshot: ProductionMetricsSnapshot = {
    requests: 0,
    successes: 0,
    errors: 0,
    clarifications: 0,
    refusals: 0,
    actions: 0,
    cancelled: 0,
    timeouts: 0,
    llmUnavailable: 0,
    llmInvalid: 0,
    permissionDenied: 0,
    executionFailed: 0,
    responseFallback: 0,
    concurrentRejected: 0,
    latency: {
      understand: emptyBucket(),
      decision: emptyBucket(),
      planning: emptyBucket(),
      execution: emptyBucket(),
      response: emptyBucket(),
      total: emptyBucket(),
    },
  };

  recordRequest(kind: {
    success?: boolean;
    error?: boolean;
    clarification?: boolean;
    refusal?: boolean;
    action?: boolean;
    cancelled?: boolean;
    timeout?: boolean;
    llmUnavailable?: boolean;
    llmInvalid?: boolean;
    permissionDenied?: boolean;
    executionFailed?: boolean;
    responseFallback?: boolean;
    concurrentRejected?: boolean;
    understandMs?: number | null;
    decisionMs?: number | null;
    planningMs?: number | null;
    executionMs?: number | null;
    responseMs?: number | null;
    totalMs?: number | null;
  }): void {
    this.snapshot.requests += 1;
    if (kind.success) this.snapshot.successes += 1;
    if (kind.error) this.snapshot.errors += 1;
    if (kind.clarification) this.snapshot.clarifications += 1;
    if (kind.refusal) this.snapshot.refusals += 1;
    if (kind.action) this.snapshot.actions += 1;
    if (kind.cancelled) this.snapshot.cancelled += 1;
    if (kind.timeout) this.snapshot.timeouts += 1;
    if (kind.llmUnavailable) this.snapshot.llmUnavailable += 1;
    if (kind.llmInvalid) this.snapshot.llmInvalid += 1;
    if (kind.permissionDenied) this.snapshot.permissionDenied += 1;
    if (kind.executionFailed) this.snapshot.executionFailed += 1;
    if (kind.responseFallback) this.snapshot.responseFallback += 1;
    if (kind.concurrentRejected) this.snapshot.concurrentRejected += 1;

    recordLatency(this.snapshot.latency.understand, kind.understandMs);
    recordLatency(this.snapshot.latency.decision, kind.decisionMs);
    recordLatency(this.snapshot.latency.planning, kind.planningMs);
    recordLatency(this.snapshot.latency.execution, kind.executionMs);
    recordLatency(this.snapshot.latency.response, kind.responseMs);
    recordLatency(this.snapshot.latency.total, kind.totalMs);
  }

  getSnapshot(): ProductionMetricsSnapshot {
    return structuredClone(this.snapshot);
  }

  format(): string {
    const s = this.snapshot;
    const lat = (b: LatencyBucketStats, label: string) => {
      if (b.count === 0) return `${label}: unavailable`;
      const avg = b.sumMs / b.count;
      const p50 = percentile(b.samples, 50);
      const p95 = percentile(b.samples, 95);
      return `${label}: n=${b.count} avg=${avg.toFixed(1)}ms p50=${p50?.toFixed(1) ?? "n/a"}ms p95=${p95?.toFixed(1) ?? "n/a"}ms max=${b.maxMs.toFixed(1)}ms`;
    };
    return [
      "=== JARVIS PRODUCTION METRICS ===",
      "",
      `requests: ${s.requests}`,
      `successes: ${s.successes}`,
      `errors: ${s.errors}`,
      `clarifications: ${s.clarifications}`,
      `refusals: ${s.refusals}`,
      `actions: ${s.actions}`,
      `cancelled: ${s.cancelled}`,
      `timeouts: ${s.timeouts}`,
      `llmUnavailable: ${s.llmUnavailable}`,
      `llmInvalid: ${s.llmInvalid}`,
      `permissionDenied: ${s.permissionDenied}`,
      `executionFailed: ${s.executionFailed}`,
      `responseFallback: ${s.responseFallback}`,
      `concurrentRejected: ${s.concurrentRejected}`,
      "",
      "LATENCY",
      "-------",
      lat(s.latency.understand, "understand"),
      lat(s.latency.decision, "decision"),
      lat(s.latency.planning, "planning"),
      lat(s.latency.execution, "execution"),
      lat(s.latency.response, "response"),
      lat(s.latency.total, "total"),
    ].join("\n");
  }

  reset(): void {
    this.snapshot = {
      requests: 0,
      successes: 0,
      errors: 0,
      clarifications: 0,
      refusals: 0,
      actions: 0,
      cancelled: 0,
      timeouts: 0,
      llmUnavailable: 0,
      llmInvalid: 0,
      permissionDenied: 0,
      executionFailed: 0,
      responseFallback: 0,
      concurrentRejected: 0,
      latency: {
        understand: emptyBucket(),
        decision: emptyBucket(),
        planning: emptyBucket(),
        execution: emptyBucket(),
        response: emptyBucket(),
        total: emptyBucket(),
      },
    };
  }
}
