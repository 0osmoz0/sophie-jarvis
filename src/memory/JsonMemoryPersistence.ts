/**
 * JSON file persistence for memory — local disk only.
 * Never writes secrets (records are pre-validated).
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { MemoryRecord } from "./types.js";
import type { MemoryPersistence } from "./MemoryPersistence.js";
import { MEMORY_KINDS } from "./types.js";

export interface JsonMemoryPersistenceOptions {
  filePath: string;
}

export class JsonMemoryPersistence implements MemoryPersistence {
  private readonly filePath: string;

  constructor(options: JsonMemoryPersistenceOptions) {
    this.filePath = options.filePath;
  }

  async load(): Promise<MemoryRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return [];
      const records = (parsed as { records?: unknown }).records;
      if (!Array.isArray(records)) return [];
      return records.filter(isSafeRecord);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return [];
      return [];
    }
  }

  async save(records: MemoryRecord[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      records: records.map((r) => ({
        ...r,
        tags: [...r.tags],
      })),
    };
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
    await fs.rename(tmp, this.filePath);
  }
}

function isSafeRecord(r: unknown): r is MemoryRecord {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.content !== "string") return false;
  if (typeof o.kind !== "string" || !(MEMORY_KINDS as readonly string[]).includes(o.kind)) {
    return false;
  }
  if (typeof o.importance !== "number" || typeof o.confidence !== "number") {
    return false;
  }
  return true;
}
