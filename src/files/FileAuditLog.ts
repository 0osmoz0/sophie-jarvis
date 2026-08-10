import type { FileAuditEntry, FileAuditSink } from "./types.js";

/**
 * In-memory audit log for file operations.
 * Never stores file contents. Interface allows a secure sink later.
 */
export class MemoryFileAuditLog implements FileAuditSink {
  private readonly entries: FileAuditEntry[] = [];

  append(entry: FileAuditEntry): void {
    this.entries.push({ ...entry });
  }

  list(): readonly FileAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}
