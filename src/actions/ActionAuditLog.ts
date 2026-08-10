import type { ActionAuditEntry, ActionAuditSink } from "./types.js";

export class MemoryActionAuditLog implements ActionAuditSink {
  private readonly entries: ActionAuditEntry[] = [];

  append(entry: ActionAuditEntry): void {
    this.entries.push({ ...entry, meta: entry.meta ? { ...entry.meta } : undefined });
  }

  list(): readonly ActionAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}
