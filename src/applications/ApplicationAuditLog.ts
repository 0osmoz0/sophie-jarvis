import type { ApplicationAuditEntry, ApplicationAuditSink } from "./types.js";

/** In-memory application audit — never stores window contents or PII. */
export class MemoryApplicationAuditLog implements ApplicationAuditSink {
  private readonly entries: ApplicationAuditEntry[] = [];

  append(entry: ApplicationAuditEntry): void {
    this.entries.push({ ...entry });
  }

  list(): readonly ApplicationAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}
