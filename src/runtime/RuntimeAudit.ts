import type { RuntimeAuditEntry, RuntimeAuditSink } from "./types.js";

export class MemoryRuntimeAuditLog implements RuntimeAuditSink {
  private readonly entries: RuntimeAuditEntry[] = [];

  append(entry: RuntimeAuditEntry): void {
    this.entries.push({ ...entry });
  }

  list(): readonly RuntimeAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}
