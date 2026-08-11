import type { Decision, DecisionAuditEntry } from "./types.js";

/**
 * Privacy-preserving decision audit.
 * Never stores message content, memory bodies, secrets, or payload hashes.
 */
export interface DecisionAuditSink {
  append(entry: DecisionAuditEntry): void;
  list(): readonly DecisionAuditEntry[];
  clear(): void;
}

export class MemoryDecisionAuditLog implements DecisionAuditSink {
  private readonly entries: DecisionAuditEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  append(entry: DecisionAuditEntry): void {
    this.entries.push(entry);
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  list(): readonly DecisionAuditEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries.length = 0;
  }
}

export function toAuditEntry(
  decision: Decision,
  latencyMs: number,
  result: string,
  nowIso: string,
): DecisionAuditEntry {
  return {
    timestamp: nowIso,
    decisionId: decision.id,
    type: decision.type,
    confidence: decision.confidence,
    risk: decision.riskLevel,
    sourceCategories: [
      ...new Set(decision.evidence.map((e) => e.source)),
    ],
    latencyMs,
    result,
    memoryUsed: decision.memoryUsed,
    contextUsed: decision.contextUsed,
    contradictionDetected: decision.contradictionDetected,
    origin: decision.origin,
  };
}
