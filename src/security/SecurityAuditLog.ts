import type { SecurityAuditEntry, SecurityAuditSink } from "./types.js";

export class MemorySecurityAuditLog implements SecurityAuditSink {
  private readonly entries: SecurityAuditEntry[] = [];

  append(entry: SecurityAuditEntry): void {
    this.entries.push({ ...entry });
  }

  list(): readonly SecurityAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}
