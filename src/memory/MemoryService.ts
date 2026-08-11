/**
 * MemoryService — validate → policy → dedupe/conflict → store → persist.
 * MEMORY INFORMS ONLY. Never executes actions. Never bypasses security.
 */
import { randomUUID } from "node:crypto";
import { MemoryPolicy } from "./MemoryPolicy.js";
import { MemoryValidator, normalizeMemoryContent } from "./MemoryValidator.js";
import { InMemoryMemoryStore } from "./InMemoryMemoryStore.js";
import type { MemoryStore } from "./MemoryStore.js";
import {
  NullMemoryPersistence,
  type MemoryPersistence,
} from "./MemoryPersistence.js";
import { MemoryAuditLog, type MemoryAuditSink } from "./MemoryAuditLog.js";
import {
  DEFAULT_MAX_MEMORIES,
  DEFAULT_MEMORY_RECALL_BUDGET,
  type MemoryCandidate,
  type MemoryKind,
  type MemoryOperationResult,
  type MemoryRecallBudget,
  type MemoryRecord,
  type MemoryServiceStatus,
  type MemoryTiming,
} from "./types.js";

export interface MemoryServiceOptions {
  store?: MemoryStore;
  persistence?: MemoryPersistence;
  audit?: MemoryAuditSink;
  maxMemories?: number;
  now?: () => number;
  /** Auto-load persistence on construct (async fire-and-forget). */
  autoload?: boolean;
}

export class MemoryService {
  private readonly store: MemoryStore;
  private readonly persistence: MemoryPersistence;
  private readonly audit: MemoryAuditSink;
  private readonly validator = new MemoryValidator();
  private readonly policy = new MemoryPolicy();
  private readonly now: () => number;
  private readonly maxMemories: number;
  private ready: Promise<void>;

  constructor(options: MemoryServiceOptions = {}) {
    this.maxMemories = options.maxMemories ?? DEFAULT_MAX_MEMORIES;
    this.store =
      options.store ?? new InMemoryMemoryStore(this.maxMemories);
    this.persistence = options.persistence ?? new NullMemoryPersistence();
    this.audit = options.audit ?? new MemoryAuditLog();
    this.now = options.now ?? (() => Date.now());
    this.ready =
      options.autoload === false
        ? Promise.resolve()
        : this.reloadFromPersistence();
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  status(): MemoryServiceStatus {
    return {
      count: this.store.count(),
      maxMemories: this.maxMemories,
      persistenceEnabled: !(this.persistence instanceof NullMemoryPersistence),
      mode: "MEMORY_INFORMS_ONLY",
    };
  }

  async remember(raw: MemoryCandidate): Promise<MemoryOperationResult> {
    const t0 = this.now();
    const timing: Partial<MemoryTiming> = {};

    const v0 = this.now();
    const validated = this.validator.validate(raw);
    timing.validationMs = this.now() - v0;
    if (!validated.ok || !validated.candidate) {
      this.audit.append({
        timestamp: new Date(this.now()).toISOString(),
        operation: "REJECT",
        memoryId: null,
        kind: typeof raw.kind === "string" ? raw.kind : null,
        source: raw.source ?? null,
        result: "rejected",
        reason: validated.reason ?? "invalid",
        latencyMs: this.now() - t0,
      });
      return {
        ok: false,
        decision: "REJECT",
        reason: validated.reason,
        timing: { ...timing, totalMemoryMs: this.now() - t0 },
      };
    }

    const candidate = validated.candidate;
    const p0 = this.now();
    const policy = this.policy.decide(candidate);
    timing.policyMs = this.now() - p0;

    if (policy.decision === "REJECT") {
      this.audit.append({
        timestamp: new Date(this.now()).toISOString(),
        operation: "REJECT",
        memoryId: null,
        kind: candidate.kind,
        source: candidate.source ?? null,
        result: "rejected",
        reason: policy.reason,
        latencyMs: this.now() - t0,
      });
      return {
        ok: false,
        decision: "REJECT",
        reason: policy.reason,
        timing: { ...timing, totalMemoryMs: this.now() - t0 },
      };
    }

    this.expireDue();

    const kind = policy.kind ?? candidate.kind;
    const confidence = policy.confidence ?? candidate.confidence ?? 0.7;
    const normalized = normalizeMemoryContent(candidate.content);
    const now = this.now();
    let expiresAt = candidate.expiresAt;
    if (policy.decision === "TEMPORARY" && policy.expiresInMs != null) {
      expiresAt = now + policy.expiresInMs;
    }

    const d0 = this.now();
    const conflict = this.findConflict(kind, normalized);
    if (conflict && candidate.source === "user_explicit") {
      const updated = this.store.update(conflict.id, {
        content: candidate.content,
        normalizedContent: normalized,
        confidence: Math.max(conflict.confidence, confidence),
        importance: Math.max(
          conflict.importance,
          candidate.importance ?? 0.5,
        ),
        updatedAt: now,
        source: candidate.source,
        tags: mergeTags(conflict.tags, candidate.tags ?? []),
        expiresAt,
        kind,
      });
      timing.deduplicationMs = this.now() - d0;
      await this.persist(timing);
      this.audit.append({
        timestamp: new Date(this.now()).toISOString(),
        operation: "CONFLICT_RESOLVED",
        memoryId: conflict.id,
        kind,
        source: candidate.source ?? null,
        result: "success",
        reason: "supersede_explicit",
        latencyMs: this.now() - t0,
      });
      timing.rememberMs = this.now() - t0;
      timing.totalMemoryMs = timing.rememberMs;
      return {
        ok: true,
        decision: "CONFLICT_RESOLVED",
        record: updated ?? undefined,
        reason: "superseded_previous",
        timing,
      };
    }

    const dup = this.findDuplicate(normalized, kind);
    if (dup) {
      const updated = this.store.update(dup.id, {
        content: pickRicher(dup.content, candidate.content),
        normalizedContent: normalized,
        confidence: Math.max(dup.confidence, confidence),
        importance: Math.max(dup.importance, candidate.importance ?? 0.5),
        updatedAt: now,
        tags: mergeTags(dup.tags, candidate.tags ?? []),
        expiresAt: expiresAt ?? dup.expiresAt,
        source:
          candidate.source === "user_explicit" ? "user_explicit" : dup.source,
      });
      timing.deduplicationMs = this.now() - d0;
      await this.persist(timing);
      this.audit.append({
        timestamp: new Date(this.now()).toISOString(),
        operation: "DEDUPLICATE",
        memoryId: dup.id,
        kind,
        source: candidate.source ?? null,
        result: "success",
        reason: "merged_duplicate",
        latencyMs: this.now() - t0,
      });
      timing.rememberMs = this.now() - t0;
      timing.totalMemoryMs = timing.rememberMs;
      return {
        ok: true,
        decision: "DEDUPLICATE",
        record: updated ?? undefined,
        reason: "merged",
        timing,
      };
    }
    timing.deduplicationMs = this.now() - d0;

    const record: MemoryRecord = {
      id: randomUUID(),
      kind,
      content: candidate.content,
      normalizedContent: normalized,
      importance: candidate.importance ?? 0.5,
      confidence,
      sensitivity: candidate.sensitivity ?? "normal",
      source: candidate.source ?? "conversation",
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      tags: [...(candidate.tags ?? [])],
      expiresAt,
      supersedesId: conflict?.id,
    };

    if (conflict) {
      this.store.delete(conflict.id);
    }

    const created = this.store.create(record);
    await this.persist(timing);
    this.audit.append({
      timestamp: new Date(this.now()).toISOString(),
      operation: "STORE",
      memoryId: created.id,
      kind: created.kind,
      source: created.source,
      result: "success",
      reason: policy.reason,
      latencyMs: this.now() - t0,
    });
    timing.rememberMs = this.now() - t0;
    timing.totalMemoryMs = timing.rememberMs;
    return {
      ok: true,
      decision: policy.decision === "TEMPORARY" ? "STORE" : "STORE",
      record: created,
      reason: policy.reason,
      timing,
    };
  }

  async recall(
    query: string,
    budget: MemoryRecallBudget = DEFAULT_MEMORY_RECALL_BUDGET,
  ): Promise<{ records: MemoryRecord[]; timing: Partial<MemoryTiming> }> {
    const t0 = this.now();
    this.expireDue();
    const s0 = this.now();
    const found = this.store.search(query);
    const searchMs = this.now() - s0;
    const records: MemoryRecord[] = [];
    let chars = 0;
    for (const r of found) {
      if (records.length >= budget.maxMemories) break;
      if (chars + r.content.length > budget.maxCharacters) break;
      records.push(this.touch(r));
      chars += r.content.length;
    }
    this.audit.append({
      timestamp: new Date(this.now()).toISOString(),
      operation: "READ",
      memoryId: records[0]?.id ?? null,
      kind: null,
      source: null,
      result: "success",
      reason: `recall:${records.length}`,
      latencyMs: this.now() - t0,
    });
    return {
      records,
      timing: {
        searchMs,
        recallMs: this.now() - t0,
        totalMemoryMs: this.now() - t0,
      },
    };
  }

  async search(query: string): Promise<MemoryRecord[]> {
    const t0 = this.now();
    this.expireDue();
    const results = this.store.search(query).map((r) => this.touch(r));
    this.audit.append({
      timestamp: new Date(this.now()).toISOString(),
      operation: "SEARCH",
      memoryId: null,
      kind: null,
      source: null,
      result: "success",
      reason: `hits:${results.length}`,
      latencyMs: this.now() - t0,
    });
    return results;
  }

  async list(): Promise<MemoryRecord[]> {
    this.expireDue();
    return this.store.list();
  }

  async get(id: string): Promise<MemoryRecord | null> {
    this.expireDue();
    const r = this.store.get(id);
    return r ? this.touch(r) : null;
  }

  async forget(idOrQuery: string): Promise<MemoryOperationResult> {
    const t0 = this.now();
    this.expireDue();
    let target = this.store.get(idOrQuery);
    if (!target) {
      const hits = this.store.search(idOrQuery);
      target = hits[0] ?? null;
    }
    if (!target) {
      this.audit.append({
        timestamp: new Date(this.now()).toISOString(),
        operation: "FORGET",
        memoryId: null,
        kind: null,
        source: null,
        result: "rejected",
        reason: "not_found",
        latencyMs: this.now() - t0,
      });
      return { ok: false, decision: "FORGET", reason: "not_found" };
    }
    this.store.delete(target.id);
    const timing: Partial<MemoryTiming> = {};
    await this.persist(timing);
    this.audit.append({
      timestamp: new Date(this.now()).toISOString(),
      operation: "FORGET",
      memoryId: target.id,
      kind: target.kind,
      source: target.source,
      result: "success",
      reason: "user_forget",
      latencyMs: this.now() - t0,
    });
    return {
      ok: true,
      decision: "FORGET",
      record: target,
      reason: "forgotten",
      timing: { ...timing, totalMemoryMs: this.now() - t0 },
    };
  }

  async clear(): Promise<void> {
    this.store.clear();
    const timing: Partial<MemoryTiming> = {};
    await this.persist(timing);
    this.audit.append({
      timestamp: new Date(this.now()).toISOString(),
      operation: "CLEAR",
      memoryId: null,
      kind: null,
      source: null,
      result: "success",
      reason: "clear_all",
      latencyMs: 0,
    });
  }

  /**
   * Application/name hints for security informing only — never bypass.
   */
  applicationHints(): string[] {
    const hints: string[] = [];
    for (const r of this.store.list()) {
      if (r.kind !== "preference" && r.kind !== "project") continue;
      const m = r.content.match(
        /\b(vs\s*code|vscode|cursor|safari|chrome|spotify|terminal|xcode|intellij)\b/i,
      );
      if (m) hints.push(m[1]!.toLowerCase().replace(/\s+/g, ""));
    }
    return [...new Set(hints)];
  }

  getAudit(): readonly import("./MemoryAuditLog.js").MemoryAuditEntry[] {
    return this.audit.list();
  }

  private touch(r: MemoryRecord): MemoryRecord {
    const updated = this.store.update(r.id, {
      lastAccessedAt: this.now(),
      accessCount: (r.accessCount ?? 0) + 1,
    });
    return updated ?? r;
  }

  private expireDue(): void {
    const now = this.now();
    for (const r of this.store.list()) {
      if (r.expiresAt != null && r.expiresAt <= now) {
        this.store.delete(r.id);
        this.audit.append({
          timestamp: new Date(now).toISOString(),
          operation: "EXPIRE",
          memoryId: r.id,
          kind: r.kind,
          source: r.source,
          result: "success",
          reason: "expired",
          latencyMs: 0,
        });
      }
    }
  }

  private findDuplicate(
    normalized: string,
    kind: MemoryKind,
  ): MemoryRecord | null {
    const topic = preferenceTopic(normalized);
    for (const r of this.store.list()) {
      if (r.kind !== kind) continue;
      const other = r.normalizedContent ?? normalizeMemoryContent(r.content);
      if (other === normalized) return r;
      if (similarity(other, normalized) >= 0.72) return r;
      if (
        topic &&
        (kind === "preference" || kind === "decision") &&
        preferenceTopic(other) === topic
      ) {
        // Same preference topic + shared entity token → duplicate
        if (sharesEntity(other, normalized)) return r;
      }
    }
    return null;
  }

  private findConflict(
    kind: MemoryKind,
    normalized: string,
  ): MemoryRecord | null {
    if (kind !== "preference" && kind !== "decision") return null;
    const topic = preferenceTopic(normalized);
    if (!topic) return null;
    for (const r of this.store.list()) {
      if (r.kind !== kind) continue;
      const other = r.normalizedContent ?? normalizeMemoryContent(r.content);
      const otherTopic = preferenceTopic(other);
      if (otherTopic && otherTopic === topic) {
        // Same topic: treat as conflict when content differs
        if (other !== normalized) return r;
      }
    }
    return null;
  }

  private async persist(timing: Partial<MemoryTiming>): Promise<void> {
    const p0 = this.now();
    await this.persistence.save(this.store.list());
    timing.persistenceMs = this.now() - p0;
  }

  private async reloadFromPersistence(): Promise<void> {
    const loaded = await this.persistence.load();
    this.store.replaceAll(loaded);
  }
}

function mergeTags(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].slice(0, 8);
}

function pickRicher(a: string, b: string): string {
  return b.length >= a.length ? b : a;
}

function preferenceTopic(normalized: string): string | null {
  if (/\b(ide|vscode|vs code|cursor|editor)\b/.test(normalized)) return "ide";
  if (/\b(theme|dark mode|light mode)\b/.test(normalized)) return "theme";
  if (/\b(reponse|response|concis|short|verbose)\b/.test(normalized)) {
    return "response_style";
  }
  if (/\b(os|linux|arch|macos|windows)\b/.test(normalized)) return "os";
  return null;
}

function sharesEntity(a: string, b: string): boolean {
  const entities = [
    "vscode",
    "vs code",
    "cursor",
    "safari",
    "chrome",
    "spotify",
    "sophie",
    "jarvis",
    "dark mode",
    "light mode",
  ];
  for (const e of entities) {
    if (a.includes(e) && b.includes(e)) return true;
  }
  return false;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return (2 * inter) / (ta.size + tb.size);
}
