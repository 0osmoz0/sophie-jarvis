import type { ResponseAuditEntry } from "./types.js";

export interface ResponseAuditSink {
  append(entry: ResponseAuditEntry): void;
  list(): readonly ResponseAuditEntry[];
  clear(): void;
}

export class MemoryResponseAuditLog implements ResponseAuditSink {
  private readonly entries: ResponseAuditEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  append(entry: ResponseAuditEntry): void {
    this.entries.push(entry);
    while (this.entries.length > this.maxEntries) this.entries.shift();
  }

  list(): readonly ResponseAuditEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries.length = 0;
  }
}
