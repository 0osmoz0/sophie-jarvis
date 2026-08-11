/**
 * Memory audit — never stores content, secrets, or screenshots.
 */
export type MemoryAuditOperation =
  | "STORE"
  | "UPDATE"
  | "READ"
  | "FORGET"
  | "REJECT"
  | "EXPIRE"
  | "DEDUPLICATE"
  | "CONFLICT_RESOLVED"
  | "CLEAR"
  | "SEARCH";

export interface MemoryAuditEntry {
  timestamp: string;
  operation: MemoryAuditOperation;
  memoryId: string | null;
  kind: string | null;
  source: string | null;
  result: "success" | "rejected" | "error";
  reason: string | null;
  latencyMs: number;
}

export interface MemoryAuditSink {
  append(entry: MemoryAuditEntry): void;
  list(): readonly MemoryAuditEntry[];
}

const MAX_AUDIT = 256;

export class MemoryAuditLog implements MemoryAuditSink {
  private readonly entries: MemoryAuditEntry[] = [];

  append(entry: MemoryAuditEntry): void {
    this.entries.push({
      ...entry,
      // Defensive: never keep free-form content fields
      reason: entry.reason ? entry.reason.slice(0, 120) : null,
    });
    while (this.entries.length > MAX_AUDIT) this.entries.shift();
  }

  list(): readonly MemoryAuditEntry[] {
    return [...this.entries];
  }
}
