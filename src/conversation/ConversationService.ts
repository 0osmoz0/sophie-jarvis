import { randomUUID } from "node:crypto";
import type { MemoryService } from "../memory/MemoryService.js";
import type { ConversationStore } from "./ConversationStore.js";
import { InMemoryConversationStore } from "./InMemoryConversationStore.js";
import { ConversationWindow } from "./ConversationWindow.js";
import { ConversationSummarizer } from "./ConversationSummary.js";
import { EntityTracker } from "./EntityTracker.js";
import {
  ReferenceResolver,
  applyResolvedReference,
  clarificationQuestion,
  type EnvironmentHints,
} from "./ReferenceResolver.js";
import type {
  ConversationEntity,
  ConversationEntityType,
  ConversationMessage,
  ConversationMessageMetadata,
  ConversationRole,
  ConversationTiming,
  ConversationUnderstandBundle,
  ConversationWindowBudget,
  ReferenceResolveResult,
} from "./types.js";
import {
  DEFAULT_CONVERSATION_STORE_LIMITS,
  DEFAULT_CONVERSATION_WINDOW_BUDGET,
  DEFAULT_ENTITY_TRACKER_LIMITS,
} from "./types.js";

export interface ConversationServiceOptions {
  store?: ConversationStore;
  windowBudget?: Partial<ConversationWindowBudget>;
  storeMaxMessages?: number;
  maxEntities?: number;
  memoryService?: MemoryService;
  now?: () => number;
  /** When false, skip memory recall during prepareTurn. */
  enableMemoryHints?: boolean;
}

export interface PrepareTurnResult {
  bundle: ConversationUnderstandBundle;
  timing: ConversationTiming;
  /** Text to use for LLM understand (may be rewritten after reference resolution). */
  effectiveText: string;
  /** If set, runtime should return clarification without calling LLM. */
  earlyClarification?: string;
  userMessage: ConversationMessage;
}

/**
 * Orchestrates multi-turn conversation context for the runtime.
 * Never executes actions, never grants permissions, never writes memory automatically.
 */
export class ConversationService {
  private readonly store: ConversationStore;
  private readonly window: ConversationWindow;
  private readonly summarizer: ConversationSummarizer;
  private readonly entities: EntityTracker;
  private readonly resolver: ReferenceResolver;
  private readonly memoryService: MemoryService | undefined;
  private readonly enableMemoryHints: boolean;
  private readonly now: () => number;
  private summaryCount = 0;
  private memoryRetrievalCount = 0;
  private referenceAttempts = 0;
  private referenceResolved = 0;
  private clarificationCount = 0;

  constructor(options: ConversationServiceOptions = {}) {
    this.store =
      options.store ??
      new InMemoryConversationStore({
        maxMessages:
          options.storeMaxMessages ??
          DEFAULT_CONVERSATION_STORE_LIMITS.maxMessages,
      });
    this.window = new ConversationWindow(
      options.windowBudget ?? DEFAULT_CONVERSATION_WINDOW_BUDGET,
    );
    this.summarizer = new ConversationSummarizer();
    this.entities = new EntityTracker({
      maxEntities:
        options.maxEntities ?? DEFAULT_ENTITY_TRACKER_LIMITS.maxEntities,
    });
    this.resolver = new ReferenceResolver();
    this.memoryService = options.memoryService;
    this.enableMemoryHints = options.enableMemoryHints !== false;
    this.now = options.now ?? (() => Date.now());
  }

  getStore(): ConversationStore {
    return this.store;
  }

  getEntities(): EntityTracker {
    return this.entities;
  }

  getSummaryCount(): number {
    return this.summaryCount;
  }

  getStats() {
    return {
      messageCount: this.store.count(),
      entityCount: this.entities.count(),
      summaryCount: this.summaryCount,
      memoryRetrievalCount: this.memoryRetrievalCount,
      referenceAttempts: this.referenceAttempts,
      referenceResolved: this.referenceResolved,
      clarificationCount: this.clarificationCount,
      referenceResolutionRate:
        this.referenceAttempts === 0
          ? 0
          : this.referenceResolved / this.referenceAttempts,
      clarificationRate:
        this.store.count() === 0
          ? 0
          : this.clarificationCount / Math.max(1, this.store.count()),
    };
  }

  clear(): void {
    this.store.clear();
    this.entities.clear();
    this.summarizer.clear();
  }

  append(
    role: ConversationRole,
    content: string,
    metadata?: ConversationMessageMetadata,
  ): ConversationMessage {
    const message: ConversationMessage = {
      id: `msg_${randomUUID()}`,
      role,
      content,
      timestamp: this.now(),
      metadata,
    };
    this.store.append(message);
    return message;
  }

  trackEntityFromText(
    text: string,
    sourceMessageId: string,
    intentType?: string | null,
  ): void {
    const open = text.match(/(?:ouvre|open)\s+(?:l['']application\s+)?(.+)/i);
    if (open) {
      this.trackLabel("application", open[1]!.trim(), sourceMessageId, 0.9);
    }
    const close = text.match(/(?:ferme|close)\s+(?:l['']application\s+)?(.+)/i);
    if (close && !/^ferme[- ]le/i.test(text.trim())) {
      this.trackLabel("application", close[1]!.trim(), sourceMessageId, 0.9);
    }
    const fileDel = text.match(
      /(?:supprime|delete|efface|copie|copy)\s+(?:le\s+)?(?:fichier\s+)?([^\s].+)/i,
    );
    if (fileDel && !/application/i.test(text)) {
      const pathish = fileDel[1]!.trim().split(/\s+(?:vers|to)\s+/i)[0]!;
      if (pathish.includes("/") || /\.\w{1,5}$/.test(pathish)) {
        this.trackLabel("file", pathish, sourceMessageId, 0.85);
      }
    }
    const project = text.match(/projet\s+(?:principal\s+)?[:\-]?\s*(.+)/i);
    if (project) {
      this.trackLabel("project", project[1]!.trim(), sourceMessageId, 0.8);
    }
    if (intentType === "application.open" || intentType === "application.close") {
      // already handled via regex when text rewritten
    }
  }

  trackFromIntent(
    intentType: string,
    payload: Record<string, unknown>,
    sourceMessageId: string,
  ): void {
    if (
      (intentType === "application.open" || intentType === "application.close") &&
      typeof payload.application === "string"
    ) {
      this.trackLabel(
        "application",
        payload.application,
        sourceMessageId,
        0.95,
      );
    }
    if (
      (intentType === "file.delete" ||
        intentType === "file.copy" ||
        intentType === "file.move" ||
        intentType === "file.create") &&
      typeof payload.path === "string"
    ) {
      this.trackLabel("file", payload.path, sourceMessageId, 0.95);
    }
    if (
      (intentType === "file.copy" || intentType === "file.move") &&
      typeof payload.source === "string"
    ) {
      this.trackLabel("file", payload.source, sourceMessageId, 0.9);
    }
  }

  noteClarification(): void {
    this.clarificationCount += 1;
  }

  /**
   * Prepare conversational context for a new user turn.
   * Priority: explicit message > conversation ref > environment > memory > LLM.
   */
  async prepareTurn(
    text: string,
    environment?: EnvironmentHints,
  ): Promise<PrepareTurnResult> {
    const timing: ConversationTiming = {
      conversationAppendMs: 0,
      windowBuildMs: 0,
      referenceResolveMs: 0,
      memoryRecallMs: 0,
      contextBuildMs: 0,
      summaryMs: 0,
      totalConversationMs: 0,
    };
    const totalStart = this.now();

    const appendStart = this.now();
    const userMessage = this.append("user", text);
    this.trackEntityFromText(text, userMessage.id);
    timing.conversationAppendMs = this.now() - appendStart;

    const sumStart = this.now();
    const prevSummaryId = this.summarizer.getSummary()?.id ?? null;
    const afterSummary = this.summarizer.maybeSummarize(
      this.store,
      this.entities,
      this.now(),
    );
    if (afterSummary && afterSummary.id !== prevSummaryId) {
      this.summaryCount += 1;
    }
    timing.summaryMs = this.now() - sumStart;

    const winStart = this.now();
    const window = this.window.build(this.store, afterSummary);
    timing.windowBuildMs = this.now() - winStart;

    const refStart = this.now();
    let referenceResult: ReferenceResolveResult = {
      status: "none",
      resolved: false,
      confidence: 0,
    };
    let effectiveText = text;
    let earlyClarification: string | undefined;

    if (this.resolver.needsResolution(text)) {
      this.referenceAttempts += 1;
      referenceResult = this.resolver.resolve(text, this.entities, environment);
      if (referenceResult.resolved && referenceResult.entity) {
        this.referenceResolved += 1;
        effectiveText = applyResolvedReference(text, referenceResult.entity);
        this.entities.track({
          ...referenceResult.entity,
          lastMentionedAt: this.now(),
          sourceMessageId: userMessage.id,
        });
      } else if (
        referenceResult.status === "ambiguous" ||
        referenceResult.status === "unresolved"
      ) {
        this.clarificationCount += 1;
        earlyClarification = clarificationQuestion(referenceResult);
      }
    }
    timing.referenceResolveMs = this.now() - refStart;

    const memStart = this.now();
    let memoryHints: ConversationUnderstandBundle["memoryHints"] = [];
    const shouldRecallMemory =
      this.enableMemoryHints &&
      !!this.memoryService &&
      !earlyClarification &&
      looksLikeMemoryQuestion(text) &&
      !referenceResult.resolved;
    if (shouldRecallMemory && this.memoryService) {
      const recalled = await this.memoryService.recall(text, {
        maxMemories: 3,
        maxCharacters: 400,
      });
      this.memoryRetrievalCount += 1;
      memoryHints = recalled.records.map((m) => ({
        id: m.id,
        kind: m.kind,
        content: m.content,
      }));
      timing.memoryRecallUsed = memoryHints.length > 0;
      timing.memoryRecallSkipped = false;
    } else {
      timing.memoryRecallUsed = false;
      timing.memoryRecallSkipped = true;
    }
    timing.memoryRecallMs = this.now() - memStart;

    const ctxStart = this.now();
    const references = referenceResult.entity
      ? [
          {
            sourceMessageId: userMessage.id,
            entityType: referenceResult.entity.type,
            entityId: referenceResult.entity.id,
            label: referenceResult.entity.label,
            confidence: referenceResult.confidence,
          },
        ]
      : [];

    const bundle: ConversationUnderstandBundle = {
      messages: window.messages,
      summary: window.summary,
      references,
      entities: this.entities.recent(12),
      memoryHints,
      environment,
      resolvedText:
        effectiveText !== text ? effectiveText : undefined,
      referenceResult,
    };
    timing.contextBuildMs = this.now() - ctxStart;
    timing.totalConversationMs = this.now() - totalStart;

    return {
      bundle,
      timing,
      effectiveText,
      earlyClarification,
      userMessage,
    };
  }

  appendAssistant(
    content: string,
    metadata?: ConversationMessageMetadata,
  ): ConversationMessage {
    return this.append("assistant", content, metadata);
  }

  private trackLabel(
    type: ConversationEntityType,
    label: string,
    sourceMessageId: string,
    confidence: number,
  ): void {
    const cleaned = label.replace(/[.?!,;]+$/, "").trim();
    if (!cleaned || cleaned.length > 200) return;
    const entity: ConversationEntity = {
      id: `ent_${type}_${cleaned.toLowerCase().replace(/\s+/g, "_").slice(0, 40)}`,
      type,
      label: cleaned,
      lastMentionedAt: this.now(),
      sourceMessageId,
      confidence,
    };
    this.entities.track(entity);
  }
}

function looksLikeMemoryQuestion(text: string): boolean {
  return /quel (est )?mon|quelle est ma|préfér|ide|éditeur|projet principal|de quoi (te )?souviens|what do you remember/i.test(
    text,
  );
}
