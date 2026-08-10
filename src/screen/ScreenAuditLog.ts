import type { ScreenAuditEntry, ScreenAuditSink } from "./types.js";

/** In-memory screen audit — never stores screenshot bytes or window contents. */
export class MemoryScreenAuditLog implements ScreenAuditSink {
  private readonly entries: ScreenAuditEntry[] = [];

  append(entry: ScreenAuditEntry): void {
    // Defensive: strip any accidental data field
    const { ...safe } = entry;
    this.entries.push({ ...safe });
  }

  list(): readonly ScreenAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}
