import type { ConversationStore } from "./ConversationStore.js";
import type {
  ConversationMessage,
  ConversationSummarySnapshot,
  ConversationWindowBudget,
} from "./types.js";
import { DEFAULT_CONVERSATION_WINDOW_BUDGET } from "./types.js";

export interface ConversationWindowResult {
  messages: ConversationMessage[];
  summary: ConversationSummarySnapshot | null;
  characterCount: number;
  approximateTokens: number;
  truncated: boolean;
}

/**
 * Selects a bounded slice of conversation for the LLM.
 * Never sends the full unbounded history.
 */
export class ConversationWindow {
  private readonly budget: ConversationWindowBudget;

  constructor(budget: Partial<ConversationWindowBudget> = {}) {
    this.budget = {
      ...DEFAULT_CONVERSATION_WINDOW_BUDGET,
      ...budget,
    };
  }

  getBudget(): ConversationWindowBudget {
    return { ...this.budget };
  }

  build(
    store: ConversationStore,
    summary: ConversationSummarySnapshot | null = null,
  ): ConversationWindowResult {
    const recent = store.getRecent(this.budget.maxMessages);
    const selected: ConversationMessage[] = [];
    let characters = 0;
    let truncated = false;

    // Newest-first fill, then reverse for chronological order.
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i]!;
      const nextChars = characters + msg.content.length;
      const nextTokens = Math.ceil(nextChars / 4);
      if (
        selected.length >= this.budget.maxMessages ||
        nextChars > this.budget.maxCharacters ||
        nextTokens > this.budget.maxTokens
      ) {
        truncated = true;
        break;
      }
      selected.push(msg);
      characters = nextChars;
    }
    selected.reverse();

    // Reserve summary characters in the reported budget accounting.
    if (summary) {
      characters += summary.text.length;
    }

    return {
      messages: selected,
      summary,
      characterCount: characters,
      approximateTokens: Math.ceil(characters / 4),
      truncated,
    };
  }
}
