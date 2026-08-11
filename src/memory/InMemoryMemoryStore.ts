/**
 * In-memory bounded MemoryStore.
 */
import type { MemoryRecord } from "./types.js";
import type { MemoryStore } from "./MemoryStore.js";
import { normalizeMemoryContent } from "./MemoryValidator.js";

export class InMemoryMemoryStore implements MemoryStore {
  private readonly records = new Map<string, MemoryRecord>();
  private readonly maxMemories: number;

  constructor(maxMemories: number = 500) {
    this.maxMemories = Math.max(1, maxMemories);
  }

  create(record: MemoryRecord): MemoryRecord {
    this.enforceCapacity();
    const copy = clone(record);
    this.records.set(copy.id, copy);
    return clone(copy);
  }

  get(id: string): MemoryRecord | null {
    const r = this.records.get(id);
    return r ? clone(r) : null;
  }

  update(id: string, patch: Partial<MemoryRecord>): MemoryRecord | null {
    const existing = this.records.get(id);
    if (!existing) return null;
    const next: MemoryRecord = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      tags: patch.tags ? [...patch.tags] : [...existing.tags],
    };
    this.records.set(id, next);
    return clone(next);
  }

  delete(id: string): boolean {
    return this.records.delete(id);
  }

  list(): MemoryRecord[] {
    return [...this.records.values()].map(clone);
  }

  search(query: string): MemoryRecord[] {
    const q = normalizeMemoryContent(query);
    if (!q) return [];
    const tokens = q.split(" ").filter((t) => t.length > 1);
    return this.list()
      .map((r) => {
        const hay = r.normalizedContent ?? normalizeMemoryContent(r.content);
        let score = 0;
        if (hay.includes(q)) score += 5;
        for (const t of tokens) {
          if (hay.includes(t)) score += 1;
        }
        for (const tag of r.tags) {
          if (q.includes(tag) || tag.includes(q)) score += 2;
        }
        return { r, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.r.importance - a.r.importance)
      .map((x) => x.r);
  }

  count(): number {
    return this.records.size;
  }

  clear(): void {
    this.records.clear();
  }

  replaceAll(records: MemoryRecord[]): void {
    this.records.clear();
    for (const r of records.slice(0, this.maxMemories)) {
      this.records.set(r.id, clone(r));
    }
  }

  private enforceCapacity(): void {
    while (this.records.size >= this.maxMemories) {
      // Evict lowest importance, then oldest updated
      let victim: string | null = null;
      let best = Infinity;
      let oldest = Infinity;
      for (const [id, r] of this.records) {
        const score = r.importance * 1000 + (r.accessCount ?? 0);
        if (score < best || (score === best && r.updatedAt < oldest)) {
          best = score;
          oldest = r.updatedAt;
          victim = id;
        }
      }
      if (victim) this.records.delete(victim);
      else break;
    }
  }
}

function clone(r: MemoryRecord): MemoryRecord {
  return { ...r, tags: [...r.tags] };
}
