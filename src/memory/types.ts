/**
 * Phase 16 — long-term memory types.
 * MEMORY INFORMS. MEMORY NEVER DECIDES. MEMORY NEVER EXECUTES.
 */

export type MemoryKind =
  | "fact"
  | "preference"
  | "goal"
  | "project"
  | "decision"
  | "constraint"
  | "relationship"
  | "temporary";

export type MemorySensitivity = "normal" | "private" | "sensitive";

export type MemorySource = "user_explicit" | "conversation" | "system";

export type MemoryPolicyDecision =
  | "STORE"
  | "REJECT"
  | "EXPIRE"
  | "FORGET"
  | "TEMPORARY";

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  content: string;
  normalizedContent?: string;
  importance: number;
  confidence: number;
  sensitivity: MemorySensitivity;
  source: MemorySource;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt?: number;
  expiresAt?: number;
  accessCount: number;
  tags: string[];
  /** Soft conflict chain — previous id superseded by this one. */
  supersedesId?: string;
}

export interface MemoryCandidate {
  kind: MemoryKind;
  content: string;
  importance?: number;
  confidence?: number;
  sensitivity?: MemorySensitivity;
  source?: MemorySource;
  tags?: string[];
  expiresAt?: number;
}

export interface MemoryRecallBudget {
  maxMemories: number;
  maxCharacters: number;
}

export const DEFAULT_MEMORY_RECALL_BUDGET: MemoryRecallBudget = {
  maxMemories: 5,
  maxCharacters: 800,
};

export const DEFAULT_MAX_MEMORIES = 500;
export const MAX_CONTENT_CHARS = 500;
export const MAX_TAGS = 8;
export const MAX_TAG_CHARS = 40;

export const MEMORY_KINDS: readonly MemoryKind[] = [
  "fact",
  "preference",
  "goal",
  "project",
  "decision",
  "constraint",
  "relationship",
  "temporary",
] as const;

export interface MemoryTiming {
  validationMs: number;
  policyMs: number;
  deduplicationMs: number;
  persistenceMs: number;
  rememberMs: number;
  recallMs: number;
  searchMs: number;
  totalMemoryMs: number;
}

export interface MemoryOperationResult {
  ok: boolean;
  decision: MemoryPolicyDecision | "READ" | "UPDATE" | "DEDUPLICATE" | "CONFLICT_RESOLVED";
  record?: MemoryRecord;
  reason?: string;
  timing?: Partial<MemoryTiming>;
}

export interface MemoryServiceStatus {
  count: number;
  maxMemories: number;
  persistenceEnabled: boolean;
  mode: "MEMORY_INFORMS_ONLY";
}
