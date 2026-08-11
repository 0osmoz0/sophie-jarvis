import type { ConversationMessage } from "./types.js";

/**
 * Bounded local conversation history.
 * Independent from MemoryStore — never auto-promotes to long-term memory.
 */
export interface ConversationStore {
  append(message: ConversationMessage): void;
  getRecent(limit: number): ConversationMessage[];
  get(id: string): ConversationMessage | undefined;
  clear(): void;
  count(): number;
  /** Oldest → newest (bounded view). */
  all(): ConversationMessage[];
}
