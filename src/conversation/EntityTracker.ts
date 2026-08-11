import type {
  ConversationEntity,
  ConversationEntityType,
  EntityTrackerLimits,
} from "./types.js";
import { DEFAULT_ENTITY_TRACKER_LIMITS } from "./types.js";

/**
 * Bounded conversational entity register.
 * Never auto-writes to long-term MemoryStore.
 */
export class EntityTracker {
  private readonly entities: ConversationEntity[] = [];
  private readonly maxEntities: number;

  constructor(limits: Partial<EntityTrackerLimits> = {}) {
    this.maxEntities =
      limits.maxEntities ?? DEFAULT_ENTITY_TRACKER_LIMITS.maxEntities;
  }

  track(entity: ConversationEntity): void {
    const key = normalizeKey(entity.type, entity.label);
    const existingIdx = this.entities.findIndex(
      (e) => normalizeKey(e.type, e.label) === key,
    );
    if (existingIdx >= 0) {
      const prev = this.entities[existingIdx]!;
      this.entities[existingIdx] = {
        ...prev,
        ...entity,
        confidence: Math.max(prev.confidence, entity.confidence),
        lastMentionedAt: entity.lastMentionedAt,
        sourceMessageId: entity.sourceMessageId,
      };
    } else {
      this.entities.push(entity);
    }
    this.entities.sort((a, b) => b.lastMentionedAt - a.lastMentionedAt);
    while (this.entities.length > this.maxEntities) {
      this.entities.pop();
    }
  }

  recent(limit?: number): ConversationEntity[] {
    const n = limit ?? this.entities.length;
    return this.entities.slice(0, Math.max(0, n));
  }

  byType(type: ConversationEntityType, limit = 8): ConversationEntity[] {
    return this.entities.filter((e) => e.type === type).slice(0, limit);
  }

  clear(): void {
    this.entities.length = 0;
  }

  count(): number {
    return this.entities.length;
  }
}

function normalizeKey(type: string, label: string): string {
  return `${type}:${label.trim().toLowerCase()}`;
}
