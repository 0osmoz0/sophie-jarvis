/**
 * MemoryStore interface — bounded, validated records only.
 */
import type { MemoryRecord } from "./types.js";

export interface MemoryStore {
  create(record: MemoryRecord): MemoryRecord;
  get(id: string): MemoryRecord | null;
  update(id: string, patch: Partial<MemoryRecord>): MemoryRecord | null;
  delete(id: string): boolean;
  list(): MemoryRecord[];
  search(query: string): MemoryRecord[];
  count(): number;
  clear(): void;
  replaceAll(records: MemoryRecord[]): void;
}
