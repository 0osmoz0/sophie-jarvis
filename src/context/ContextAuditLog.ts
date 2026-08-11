import type { ContextAuditEntry, ContextAuditSink } from "./types.js";

export class MemoryContextAuditLog implements ContextAuditSink {
  private readonly entries: ContextAuditEntry[] = [];

  append(entry: ContextAuditEntry): void {
    this.entries.push({ ...entry });
  }

  list(): readonly ContextAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}
