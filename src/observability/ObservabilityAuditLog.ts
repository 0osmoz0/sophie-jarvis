/**
 * Phase 21 — bounded observability audit (metadata only).
 */

import { OBSERVABILITY_LIMITS } from "./types.js";

export interface ObservabilityAuditEntry {
  timestamp: string;
  requestId: string;
  event: string;
  stage?: string | null;
  code?: string | null;
  latencyMs?: number | null;
}

export class ObservabilityAuditLog {
  private readonly entries: ObservabilityAuditEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = OBSERVABILITY_LIMITS.maxAuditEntries) {
    this.maxEntries = maxEntries;
  }

  append(entry: ObservabilityAuditEntry): void {
    this.entries.push({ ...entry });
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  list(): readonly ObservabilityAuditEntry[] {
    return [...this.entries];
  }

  count(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries.length = 0;
  }
}
