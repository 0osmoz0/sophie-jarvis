/**
 * Memory persistence — local only, no network.
 */
import type { MemoryRecord } from "./types.js";

export interface MemoryPersistence {
  load(): Promise<MemoryRecord[]>;
  save(records: MemoryRecord[]): Promise<void>;
}

/** No-op persistence (session RAM only). */
export class NullMemoryPersistence implements MemoryPersistence {
  async load(): Promise<MemoryRecord[]> {
    return [];
  }
  async save(_records: MemoryRecord[]): Promise<void> {
    /* no-op */
  }
}
