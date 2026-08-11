/**
 * Phase 17 — conversational intelligence (multi-turn context).
 * Conversation ≠ Memory ≠ Permission.
 */

export type ConversationRole = "user" | "assistant" | "system";

export type ConversationEntityType =
  | "application"
  | "file"
  | "project"
  | "person"
  | "topic"
  | "action";

export interface ConversationMessageMetadata {
  intentType?: string;
  actionType?: string;
  taskId?: string;
  /** Audit-safe status only — never full message content in logs. */
  status?: string;
}

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  timestamp: number;
  metadata?: ConversationMessageMetadata;
}

export interface ConversationReference {
  sourceMessageId: string;
  entityType: ConversationEntityType;
  entityId?: string;
  label?: string;
  confidence: number;
}

export interface ConversationEntity {
  id: string;
  type: ConversationEntityType;
  label: string;
  lastMentionedAt: number;
  sourceMessageId: string;
  confidence: number;
}

export interface ConversationSummarySnapshot {
  id: string;
  createdAt: number;
  /** Compact summary text — not long-term memory. */
  text: string;
  /** Covered message range (inclusive ids order). */
  fromMessageId: string;
  toMessageId: string;
  activeGoals: string[];
  topics: string[];
  importantEntities: Array<{ type: ConversationEntityType; label: string }>;
  messageCountSummarized: number;
}

export interface ConversationWindowBudget {
  maxMessages: number;
  maxCharacters: number;
  /** Approximate: chars/4. Soft budget for selection. */
  maxTokens: number;
}

export const DEFAULT_CONVERSATION_WINDOW_BUDGET: ConversationWindowBudget = {
  maxMessages: 12,
  maxCharacters: 3_000,
  maxTokens: 750,
};

export interface ConversationStoreLimits {
  maxMessages: number;
}

export const DEFAULT_CONVERSATION_STORE_LIMITS: ConversationStoreLimits = {
  maxMessages: 200,
};

export interface EntityTrackerLimits {
  maxEntities: number;
}

export const DEFAULT_ENTITY_TRACKER_LIMITS: EntityTrackerLimits = {
  maxEntities: 32,
};

export type ReferenceResolveStatus =
  | "resolved"
  | "ambiguous"
  | "unresolved"
  | "none";

export interface ReferenceResolveResult {
  status: ReferenceResolveStatus;
  resolved: boolean;
  entity?: ConversationEntity;
  candidates?: ConversationEntity[];
  confidence: number;
  reason?: string;
  /** Pronoun / deixis matched in user text, if any. */
  matchedPattern?: string;
}

export interface ConversationUnderstandBundle {
  messages: ConversationMessage[];
  summary?: ConversationSummarySnapshot | null;
  references: ConversationReference[];
  entities: ConversationEntity[];
  memoryHints: Array<{ id: string; kind: string; content: string }>;
  environment?: {
    activeApplication?: string | null;
    openApplications?: string[];
  };
  /** Resolved rewrite hint for the current user turn (never authorization). */
  resolvedText?: string;
  referenceResult?: ReferenceResolveResult;
}

export interface ConversationTiming {
  conversationAppendMs: number;
  windowBuildMs: number;
  referenceResolveMs: number;
  memoryRecallMs: number;
  contextBuildMs: number;
  summaryMs: number;
  totalConversationMs: number;
  /** Phase 20 — diagnostic only. */
  memoryRecallUsed?: boolean;
  memoryRecallSkipped?: boolean;
}

export const CONVERSATION_PRIORITY = [
  "explicit_current_message",
  "explicit_conversation_reference",
  "current_environment",
  "relevant_long_term_memory",
  "general_llm_inference",
] as const;

export type ConversationPriorityLevel = (typeof CONVERSATION_PRIORITY)[number];
