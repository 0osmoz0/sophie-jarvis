import type { ConversationStore } from "./ConversationStore.js";
import type { ConversationMessage, ConversationStoreLimits } from "./types.js";
import { DEFAULT_CONVERSATION_STORE_LIMITS } from "./types.js";

export class InMemoryConversationStore implements ConversationStore {
  private readonly messages: ConversationMessage[] = [];
  private readonly byId = new Map<string, ConversationMessage>();
  private readonly maxMessages: number;

  constructor(limits: Partial<ConversationStoreLimits> = {}) {
    this.maxMessages =
      limits.maxMessages ?? DEFAULT_CONVERSATION_STORE_LIMITS.maxMessages;
  }

  append(message: ConversationMessage): void {
    this.messages.push(message);
    this.byId.set(message.id, message);
    while (this.messages.length > this.maxMessages) {
      const dropped = this.messages.shift();
      if (dropped) this.byId.delete(dropped.id);
    }
  }

  getRecent(limit: number): ConversationMessage[] {
    if (limit <= 0) return [];
    return this.messages.slice(-limit);
  }

  get(id: string): ConversationMessage | undefined {
    return this.byId.get(id);
  }

  clear(): void {
    this.messages.length = 0;
    this.byId.clear();
  }

  count(): number {
    return this.messages.length;
  }

  all(): ConversationMessage[] {
    return this.messages.slice();
  }
}
