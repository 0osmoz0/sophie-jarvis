import { randomUUID } from "node:crypto";
import type { ConversationStore } from "./ConversationStore.js";
import type { EntityTracker } from "./EntityTracker.js";
import type {
  ConversationMessage,
  ConversationSummarySnapshot,
} from "./types.js";

export interface ConversationSummarizerOptions {
  /** Trigger summary when store grows past this many messages. */
  summarizeAfterMessages?: number;
  /** Keep this many recent messages outside the summary. */
  keepRecentMessages?: number;
}

/**
 * Compresses older turns into a short conversational summary.
 * Never promotes the summary into long-term MemoryStore.
 */
export class ConversationSummarizer {
  private readonly summarizeAfter: number;
  private readonly keepRecent: number;
  private summary: ConversationSummarySnapshot | null = null;
  private summarizedThroughIndex = -1;

  constructor(options: ConversationSummarizerOptions = {}) {
    this.summarizeAfter = options.summarizeAfterMessages ?? 24;
    this.keepRecent = options.keepRecentMessages ?? 8;
  }

  getSummary(): ConversationSummarySnapshot | null {
    return this.summary;
  }

  clear(): void {
    this.summary = null;
    this.summarizedThroughIndex = -1;
  }

  /**
   * Maybe compress older messages. Returns the active summary (if any).
   */
  maybeSummarize(
    store: ConversationStore,
    entities: EntityTracker,
    now: number = Date.now(),
  ): ConversationSummarySnapshot | null {
    const all = store.all();
    if (all.length < this.summarizeAfter) {
      return this.summary;
    }

    const cut = Math.max(0, all.length - this.keepRecent);
    if (cut <= 0 || cut <= this.summarizedThroughIndex + 1) {
      return this.summary;
    }

    const toSummarize = all.slice(0, cut);
    this.summary = buildSummary(toSummarize, entities, this.summary, now);
    this.summarizedThroughIndex = cut - 1;
    return this.summary;
  }
}

function buildSummary(
  messages: ConversationMessage[],
  entities: EntityTracker,
  previous: ConversationSummarySnapshot | null,
  now: number,
): ConversationSummarySnapshot {
  const topics = new Set<string>();
  const goals: string[] = [];
  const decisions: string[] = [];

  for (const m of messages) {
    if (m.role === "user") {
      const clipped = m.content.trim().slice(0, 80);
      if (clipped) topics.add(clipped.toLowerCase());
      if (/^(ouvre|ferme|copie|supprime|crée|retiens)/i.test(clipped)) {
        goals.push(clipped);
      }
      if (/^non[, ]/i.test(clipped) || /pas celui/i.test(clipped)) {
        decisions.push(`correction: ${clipped}`);
      }
    }
    if (m.metadata?.intentType) {
      topics.add(m.metadata.intentType);
    }
  }

  const important = entities.recent(8).map((e) => ({
    type: e.type,
    label: e.label,
  }));

  const parts: string[] = [];
  if (previous?.text) {
    parts.push(`Précédent: ${previous.text.slice(0, 200)}`);
  }
  if (goals.length) {
    parts.push(`Objectifs: ${goals.slice(-5).join(" | ")}`);
  }
  if (decisions.length) {
    parts.push(`Décisions: ${decisions.slice(-3).join(" | ")}`);
  }
  if (important.length) {
    parts.push(
      `Entités: ${important.map((e) => `${e.type}:${e.label}`).join(", ")}`,
    );
  }
  parts.push(`Tours résumés: ${messages.length}`);

  const first = messages[0]!;
  const last = messages[messages.length - 1]!;

  return {
    id: `sum_${randomUUID()}`,
    createdAt: now,
    text: parts.join(". ").slice(0, 800),
    fromMessageId: first.id,
    toMessageId: last.id,
    activeGoals: goals.slice(-5),
    topics: [...topics].slice(0, 12),
    importantEntities: important,
    messageCountSummarized:
      (previous?.messageCountSummarized ?? 0) + messages.length,
  };
}
