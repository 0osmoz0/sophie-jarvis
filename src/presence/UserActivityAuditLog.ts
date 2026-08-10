import type { UserActivityAuditEntry, UserActivityAuditSink } from "./types.js";

/** Privacy-preserving audit — buckets only, never raw input. */
export class MemoryUserActivityAuditLog implements UserActivityAuditSink {
  private readonly entries: UserActivityAuditEntry[] = [];

  append(entry: UserActivityAuditEntry): void {
    this.entries.push({ ...entry });
  }

  list(): readonly UserActivityAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}
