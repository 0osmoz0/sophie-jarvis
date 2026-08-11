/**
 * Phase 21 — bounded collector of recent pipeline traces.
 */

import { PipelineTrace } from "./PipelineTrace.js";
import { ObservabilityAuditLog } from "./ObservabilityAuditLog.js";
import { OBSERVABILITY_LIMITS, type PipelineTraceSnapshot } from "./types.js";

export class PipelineTraceCollector {
  private readonly traces: PipelineTraceSnapshot[] = [];
  private last: PipelineTraceSnapshot | null = null;
  private readonly maxEntries: number;
  readonly audit: ObservabilityAuditLog;

  constructor(
    maxEntries = OBSERVABILITY_LIMITS.maxTraceEntries,
    audit?: ObservabilityAuditLog,
  ) {
    this.maxEntries = maxEntries;
    this.audit = audit ?? new ObservabilityAuditLog();
  }

  begin(requestId: string, now?: () => number): PipelineTrace {
    return new PipelineTrace(requestId, now);
  }

  commit(trace: PipelineTrace): PipelineTraceSnapshot {
    const snap = trace.snapshot();
    this.last = snap;
    this.traces.push(snap);
    while (this.traces.length > this.maxEntries) {
      this.traces.shift();
    }
    this.audit.append({
      timestamp: snap.completedAt ?? snap.startedAt,
      requestId: snap.requestId,
      event: "trace_complete",
      latencyMs: snap.totalMs,
      code: snap.errorCode ?? null,
    });
    return snap;
  }

  getLast(): PipelineTraceSnapshot | null {
    return this.last;
  }

  list(): readonly PipelineTraceSnapshot[] {
    return [...this.traces];
  }

  count(): number {
    return this.traces.length;
  }

  clear(): void {
    this.traces.length = 0;
    this.last = null;
    this.audit.clear();
  }
}
