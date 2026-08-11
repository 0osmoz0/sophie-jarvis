import type { RuntimeAuditEntry, RuntimeAuditSink } from "./types.js";

const DEFAULT_MAX_ENTRIES = 1_000;

export class MemoryRuntimeAuditLog implements RuntimeAuditSink {
  private readonly entries: RuntimeAuditEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  append(entry: RuntimeAuditEntry): void {
    this.entries.push({ ...entry });
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  list(): readonly RuntimeAuditEntry[] {
    return [...this.entries];
  }

  count(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries.length = 0;
  }
}
