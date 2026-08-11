import { randomUUID } from "node:crypto";
import type { ActionService } from "../actions/ActionService.js";
import type { IntentRouter } from "../ai/IntentRouter.js";
import type { LLMUnderstandRequest } from "../ai/types.js";
import type { ContextService } from "../context/ContextService.js";
import type { ContextQueryKind } from "../context/types.js";
import { ContextFormatter } from "../context/ContextFormatter.js";
import type { SophieIntegration } from "../integration/SophieIntegration.js";
import type { SophieEmitResult } from "../integration/types.js";
import type { SecurityService } from "../security/SecurityService.js";
import type { SecurityMonitor } from "../security/SecurityMonitor.js";
import type { MemoryService } from "../memory/MemoryService.js";
import {
  ConversationService,
  type ConversationTiming,
} from "../conversation/index.js";
import {
  DecisionEngine,
  DecisionExplanation,
  type Decision,
} from "../decision/index.js";
import type { JarvisSecurityIntentType, JarvisMemoryIntentType } from "../ai/types.js";
import {
  contextSnapshotToSecurityObservation,
} from "../security/fromContext.js";
import { formatAlertMessage } from "../security/SecurityAlert.js";
import { formatMonitorStatus } from "../security/SecurityMonitor.js";
import {
  candidateFromExplicitRemember,
} from "../memory/MemoryExtractor.js";
import {
  ConversationContext,
  isAffirmative,
  isNegative,
} from "./ConversationContext.js";
import { ResponseFormatter } from "./ResponseFormatter.js";
import { MemoryRuntimeAuditLog } from "./RuntimeAudit.js";
import type {
  InteractionTiming,
  JarvisResponse,
  RuntimeAuditSink,
  RuntimeState,
} from "./types.js";
import { RUNTIME_ERROR_CODES } from "./types.js";

export interface JarvisRuntimeOptions {
  router: IntentRouter;
  actions: ActionService;
  /** Optional Phase 11 context façade (read-only). */
  contextService?: ContextService;
  /** Optional Phase 12 Sophie signal integration (never executes actions). */
  sophieIntegration?: SophieIntegration;
  /** Optional Phase 14 security detection (never executes actions). */
  securityService?: SecurityService;
  /** Optional Phase 15 security monitor (alert only). */
  securityMonitor?: SecurityMonitor;
  /** Optional Phase 16 long-term memory (inform only). */
  memoryService?: MemoryService;
  /** Optional Phase 17 multi-turn conversation (≠ memory). */
  conversationService?: ConversationService;
  /** Optional Phase 18 decision engine (evaluates; never executes). */
  decisionEngine?: DecisionEngine;
  formatter?: ResponseFormatter;
  context?: ConversationContext;
  audit?: RuntimeAuditSink;
  /** Injected clock for expiration tests. */
  now?: () => number;
}

export interface ProcessInputResult {
  response: JarvisResponse;
  state: RuntimeState;
  timing: InteractionTiming;
  interactionId: string;
}

/**
 * JarvisRuntime — orchestrates existing services only.
 * No direct filesystem / shell / native system access.
 */
export class JarvisRuntime {
  private readonly router: IntentRouter;
  private readonly actions: ActionService;
  private readonly contextService: ContextService | undefined;
  private readonly sophieIntegration: SophieIntegration | undefined;
  private readonly securityService: SecurityService | undefined;
  private readonly securityMonitor: SecurityMonitor | undefined;
  private readonly memoryService: MemoryService | undefined;
  private readonly conversation: ConversationService;
  private readonly decisionEngine: DecisionEngine;
  private lastDecision: Decision | null = null;
  private readonly contextFormatter = new ContextFormatter();
  private pendingForgetQuery: string | null = null;
  private readonly formatter: ResponseFormatter;
  private readonly context: ConversationContext;
  private readonly audit: RuntimeAuditSink;
  private readonly now: () => number;
  private state: RuntimeState = "IDLE";
  private lastUserMessageId: string | null = null;

  constructor(options: JarvisRuntimeOptions) {
    this.router = options.router;
    this.actions = options.actions;
    this.contextService = options.contextService;
    this.sophieIntegration = options.sophieIntegration;
    this.securityService = options.securityService;
    this.securityMonitor = options.securityMonitor;
    this.memoryService = options.memoryService;
    this.formatter = options.formatter ?? new ResponseFormatter();
    this.context = options.context ?? new ConversationContext();
    this.audit = options.audit ?? new MemoryRuntimeAuditLog();
    this.now = options.now ?? (() => Date.now());
    this.conversation =
      options.conversationService ??
      new ConversationService({
        memoryService: options.memoryService,
        now: this.now,
      });
    this.decisionEngine =
      options.decisionEngine ??
      new DecisionEngine({
        now: this.now,
      });
  }

  getDecisionEngine(): DecisionEngine {
    return this.decisionEngine;
  }

  getLastDecision(): Decision | null {
    return this.lastDecision;
  }

  explainLastDecision(): string | null {
    if (!this.lastDecision) return null;
    return new DecisionExplanation().format(this.lastDecision);
  }

  getState(): RuntimeState {
    return this.state;
  }

  getConversationService(): ConversationService {
    return this.conversation;
  }

  getContext(): ConversationContext {
    return this.context;
  }

  /**
   * Phase 12 — accept a Sophie external signal into context/memory only.
   * Does not plan or execute actions (no parallel execution path).
   */
  receiveSophieEvent(event: unknown): SophieEmitResult {
    if (!this.sophieIntegration) {
      return {
        ok: false,
        code: "UNAVAILABLE",
        message: "Sophie integration is not configured",
        timing: {
          eventDispatchMs: 0,
          integrationMs: 0,
          snapshotMs: 0,
        },
      };
    }
    const result = this.sophieIntegration.handleInput(event);
    return result;
  }

  async processInput(input: string): Promise<ProcessInputResult> {
    const interactionId = `ix_${randomUUID()}`;
    const totalStart = this.now();
    const timing: InteractionTiming = {
      llmMs: null,
      validationMs: null,
      planningMs: null,
      confirmationMs: null,
      executionMs: null,
      totalMs: 0,
      conversationMs: null,
      decisionMs: null,
    };

    if (typeof input !== "string" || !input.trim()) {
      return this.finish(
        interactionId,
        this.formatter.error(
          RUNTIME_ERROR_CODES.INVALID_INPUT,
          "Dis-moi quelque chose.",
        ),
        "ERROR",
        timing,
        totalStart,
        null,
      );
    }

    const text = input.trim();

    // Phase 16 — pending memory forget confirmation (not an ActionExecutor path)
    if (this.pendingForgetQuery) {
      if (isAffirmative(text)) {
        const query = this.pendingForgetQuery;
        this.pendingForgetQuery = null;
        if (!this.memoryService) {
          return this.finish(
            interactionId,
            this.formatter.unavailable("Mémoire non configurée."),
            "ERROR",
            timing,
            totalStart,
            "memory.forget",
            "UNAVAILABLE",
          );
        }
        const result = await this.memoryService.forget(query);
        const message = result.ok
          ? `D'accord, j'ai oublié ce souvenir. (Aucune action système.)`
          : `Je n'ai pas trouvé ce souvenir (${result.reason ?? "not_found"}).`;
        return this.finish(
          interactionId,
          this.formatter.securityMessage(message),
          "IDLE",
          timing,
          totalStart,
          "memory.forget",
          result.ok ? "OK" : "NOT_FOUND",
        );
      }
      if (isNegative(text)) {
        this.pendingForgetQuery = null;
        return this.finish(
          interactionId,
          this.formatter.securityMessage("Oubli annulé."),
          "IDLE",
          timing,
          totalStart,
          "memory.forget",
          "CANCELLED",
        );
      }
      // New command cancels pending forget
      this.pendingForgetQuery = null;
    }

    // --- Pending confirmation branch (oui/non) ---
    const pending = this.context.getPending();
    if (pending) {
      if (this.context.isPendingExpired(this.now())) {
        this.context.clearPending();
        this.actions.cancel(pending.taskId);
        return this.finish(
          interactionId,
          this.formatter.expired(),
          "ERROR",
          timing,
          totalStart,
          null,
          "EXPIRED",
        );
      }

      if (isAffirmative(text)) {
        this.recordFollowUpUser(text);
        return this.handleConfirmYes(interactionId, timing, totalStart);
      }
      if (isNegative(text)) {
        this.recordFollowUpUser(text);
        return this.handleConfirmNo(interactionId, timing, totalStart);
      }

      // New command while waiting → invalidate old pending, then process.
      this.context.invalidatePending("new_command");
      this.actions.cancel(pending.taskId);
    }

    // Lone oui/non without pending confirmation
    if (isAffirmative(text) || isNegative(text)) {
      this.recordFollowUpUser(text);
      return this.finish(
        interactionId,
        this.formatter.noPendingConfirmation(),
        "ERROR",
        timing,
        totalStart,
        null,
        RUNTIME_ERROR_CODES.NO_PENDING_CONFIRMATION,
      );
    }

    return this.handleNewIntent(text, interactionId, timing, totalStart);
  }

  private recordFollowUpUser(text: string): void {
    const msg = this.conversation.append("user", text);
    this.lastUserMessageId = msg.id;
  }

  private async handleContextIntent(
    query: ContextQueryKind,
    interactionId: string,
    timing: InteractionTiming,
    totalStart: number,
  ): Promise<ProcessInputResult> {
    if (!this.contextService) {
      return this.finish(
        interactionId,
        this.formatter.unavailable(
          "Le service de contexte n'est pas configuré.",
        ),
        "ERROR",
        timing,
        totalStart,
        query,
        "UNAVAILABLE",
      );
    }
    try {
      const result = await this.contextService.getSnapshot(query);
      const message = this.contextFormatter.format(result.snapshot, query);
      return this.finish(
        interactionId,
        this.formatter.contextMessage(message, result.snapshot),
        "IDLE",
        timing,
        totalStart,
        query,
        "OK",
      );
    } catch (err) {
      return this.finish(
        interactionId,
        this.formatter.error(
          RUNTIME_ERROR_CODES.ERROR,
          err instanceof Error ? err.message : String(err),
        ),
        "ERROR",
        timing,
        totalStart,
        query,
        "ERROR",
      );
    }
  }

  /**
   * Phase 14 — security detection intents. Never plans or executes actions.
   */
  private async handleSecurityIntent(
    query: JarvisSecurityIntentType,
    interactionId: string,
    timing: InteractionTiming,
    totalStart: number,
  ): Promise<ProcessInputResult> {
    if (query === "security.monitor.status") {
      if (!this.securityMonitor) {
        return this.finish(
          interactionId,
          this.formatter.unavailable(
            "Le moniteur de sécurité n'est pas configuré.",
          ),
          "ERROR",
          timing,
          totalStart,
          query,
          "UNAVAILABLE",
        );
      }
      const report = this.securityMonitor.statusReport();
      return this.finish(
        interactionId,
        this.formatter.securityMessage(formatMonitorStatus(report)),
        "IDLE",
        timing,
        totalStart,
        query,
        "OK",
      );
    }

    if (!this.securityService) {
      return this.finish(
        interactionId,
        this.formatter.unavailable(
          "Le service de sécurité n'est pas configuré.",
        ),
        "ERROR",
        timing,
        totalStart,
        query,
        "UNAVAILABLE",
      );
    }
    try {
      if (query === "security.status") {
        const status = this.securityService.status();
        const message = [
          "Mode : détection uniquement (aucune action automatique).",
          `Baseline : ${status.baselineReady ? "prête" : "absente"}`,
          `Signaux en mémoire : ${status.signalCount}`,
          `Alertes en mémoire : ${status.alertCount}`,
          status.lastAssessment
            ? `Dernière évaluation : ${status.lastAssessment.level} (confiance ${status.lastAssessment.confidence.toFixed(2)})`
            : "Aucune évaluation récente.",
        ].join("\n");
        return this.finish(
          interactionId,
          this.formatter.securityMessage(message),
          "IDLE",
          timing,
          totalStart,
          query,
          "OK",
        );
      }

      if (query === "security.alerts") {
        const alerts = this.securityService.alerts();
        if (alerts.length === 0) {
          return this.finish(
            interactionId,
            this.formatter.securityMessage(
              "Aucune alerte de sécurité en mémoire pour cette session.",
            ),
            "IDLE",
            timing,
            totalStart,
            query,
            "OK",
          );
        }
        const message = alerts.map(formatAlertMessage).join("\n\n---\n\n");
        return this.finish(
          interactionId,
          this.formatter.securityMessage(message),
          "IDLE",
          timing,
          totalStart,
          query,
          "OK",
        );
      }

      // security.assess — explain available evidence only; never capture/act
      let obs;
      if (this.contextService) {
        const snap = await this.contextService.getSnapshot("system.context");
        obs = contextSnapshotToSecurityObservation(snap.snapshot);
      } else {
        obs = { timestamp: this.now() };
      }
      const result = this.securityService.assess(obs);
      let message: string;
      if (result.alerts.length > 0) {
        message = [
          ...result.alerts.map(formatAlertMessage),
          "",
          "Je peux expliquer les indices disponibles. Aucune capture ni action n'a été déclenchée.",
        ].join("\n\n");
      } else {
        message = [
          "Rien d'inhabituel d'après la baseline récente.",
          `Niveau : ${result.assessment.level}`,
          `Confiance : ${result.assessment.confidence.toFixed(2)}`,
          `Présence (indicateur logiciel) : ${result.assessment.presence}`,
          "",
          result.assessment.disclaimer,
          "Aucune action n'a été prise.",
        ].join("\n");
      }
      return this.finish(
        interactionId,
        this.formatter.securityMessage(message),
        "IDLE",
        timing,
        totalStart,
        query,
        "OK",
      );
    } catch (err) {
      return this.finish(
        interactionId,
        this.formatter.error(
          RUNTIME_ERROR_CODES.ERROR,
          err instanceof Error ? err.message : String(err),
        ),
        "ERROR",
        timing,
        totalStart,
        query,
        "ERROR",
      );
    }
  }

  /**
   * Phase 16 — memory intents. Inform only; never execute system actions.
   */
  private async handleMemoryIntent(
    intent: Extract<
      import("../ai/types.js").JarvisIntent,
      { type: JarvisMemoryIntentType }
    >,
    interactionId: string,
    timing: InteractionTiming,
    totalStart: number,
  ): Promise<ProcessInputResult> {
    if (!this.memoryService) {
      return this.finish(
        interactionId,
        this.formatter.unavailable("Le service mémoire n'est pas configuré."),
        "ERROR",
        timing,
        totalStart,
        intent.type,
        "UNAVAILABLE",
      );
    }
    try {
      // Keep security baseline informed (never a bypass)
      if (this.securityService) {
        this.securityService.baseline.markInformedHabitual(
          this.memoryService.applicationHints(),
        );
      }

      if (intent.type === "memory.list") {
        const records = await this.memoryService.list();
        if (records.length === 0) {
          return this.finish(
            interactionId,
            this.formatter.securityMessage(
              "Je n'ai aucun souvenir stocké pour cette session.",
            ),
            "IDLE",
            timing,
            totalStart,
            intent.type,
            "OK",
          );
        }
        const lines = [
          `Souvenirs (${records.length}, budget d'affichage 12) :`,
          ...records.slice(0, 12).map(
            (r) => `• [${r.kind}] ${r.content} (confiance ${r.confidence.toFixed(2)})`,
          ),
          "",
          "La mémoire informe seulement — elle n'exécute rien.",
        ];
        return this.finish(
          interactionId,
          this.formatter.securityMessage(lines.join("\n")),
          "IDLE",
          timing,
          totalStart,
          intent.type,
          "OK",
        );
      }

      if (intent.type === "memory.recall" || intent.type === "memory.search") {
        const query =
          intent.type === "memory.search"
            ? intent.payload.query
            : intent.payload.query ?? "préférences projets objectifs";
        const { records } =
          intent.type === "memory.search"
            ? {
                records: await this.memoryService.search(query),
              }
            : await this.memoryService.recall(query);
        if (records.length === 0) {
          return this.finish(
            interactionId,
            this.formatter.securityMessage(
              "Aucun souvenir pertinent trouvé.",
            ),
            "IDLE",
            timing,
            totalStart,
            intent.type,
            "OK",
          );
        }
        const lines = [
          "Voici ce dont je me souviens (pertinent uniquement) :",
          ...records.map((r) => `• ${r.content}`),
          "",
          "Je ne peux pas confirmer au-delà de ces souvenirs stockés.",
        ];
        return this.finish(
          interactionId,
          this.formatter.securityMessage(lines.join("\n")),
          "IDLE",
          timing,
          totalStart,
          intent.type,
          "OK",
        );
      }

      if (intent.type === "memory.remember") {
        const candidate = candidateFromExplicitRemember(intent.payload.content);
        if (intent.payload.kind) {
          candidate.kind = intent.payload.kind as typeof candidate.kind;
        }
        const result = await this.memoryService.remember(candidate);
        const message = result.ok
          ? `C'est noté. (${result.decision})\n« ${result.record?.content ?? intent.payload.content} »\nAucune action système.`
          : `Je ne peux pas mémoriser ça (${result.reason ?? "rejeté"}).`;
        return this.finish(
          interactionId,
          this.formatter.securityMessage(message),
          "IDLE",
          timing,
          totalStart,
          intent.type,
          result.ok ? "OK" : "REJECTED",
        );
      }

      // memory.forget — require confirmation
      this.pendingForgetQuery = intent.payload.query;
      return this.finish(
        interactionId,
        this.formatter.securityMessage(
          `Tu veux que j'oublie « ${intent.payload.query} » ? (oui/non)\nAucune suppression système — souvenir uniquement.`,
        ),
        "WAITING_CONFIRMATION",
        timing,
        totalStart,
        intent.type,
        "CONFIRMATION_REQUIRED",
      );
    } catch (err) {
      return this.finish(
        interactionId,
        this.formatter.error(
          RUNTIME_ERROR_CODES.ERROR,
          err instanceof Error ? err.message : String(err),
        ),
        "ERROR",
        timing,
        totalStart,
        intent.type,
        "ERROR",
      );
    }
  }

  private async handleConfirmYes(
    interactionId: string,
    timing: InteractionTiming,
    totalStart: number,
  ): Promise<ProcessInputResult> {
    const pending = this.context.getPending();
    if (!pending) {
      return this.finish(
        interactionId,
        this.formatter.noPendingConfirmation(),
        "ERROR",
        timing,
        totalStart,
        null,
      );
    }

    this.state = "EXECUTING";
    const confStart = this.now();
    const confirmed = this.actions.confirm(pending.taskId, pending.token);
    timing.confirmationMs = this.now() - confStart;

    if (!confirmed.success) {
      this.context.clearPending();
      const code = confirmed.error?.code ?? RUNTIME_ERROR_CODES.ERROR;
      if (code.includes("EXPIRED")) {
        return this.finish(
          interactionId,
          this.formatter.expired(),
          "ERROR",
          timing,
          totalStart,
          pending.plan.actionType,
          code,
        );
      }
      return this.finish(
        interactionId,
        this.formatter.error(code, confirmed.error?.message ?? "Confirmation refusée"),
        "ERROR",
        timing,
        totalStart,
        pending.plan.actionType,
        code,
      );
    }

    const execStart = this.now();
    const executed = await this.actions.execute(pending.taskId);
    timing.executionMs = this.now() - execStart;
    this.context.clearPending();

    if (!executed.success) {
      return this.finish(
        interactionId,
        this.formatter.error(
          executed.error?.code ?? RUNTIME_ERROR_CODES.EXECUTION_FAILED,
          executed.error?.message ?? "Échec de l'exécution",
        ),
        "ERROR",
        timing,
        totalStart,
        pending.plan.actionType,
        executed.error?.code ?? "FAILED",
      );
    }

    return this.finish(
      interactionId,
      this.formatter.executed(
        pending.taskId,
        pending.plan.actionType,
        executed.data?.result,
      ),
      "COMPLETED",
      timing,
      totalStart,
      pending.plan.actionType,
      "OK",
      "approved",
      "COMPLETED",
    );
  }

  private async handleConfirmNo(
    interactionId: string,
    timing: InteractionTiming,
    totalStart: number,
  ): Promise<ProcessInputResult> {
    const pending = this.context.getPending();
    if (!pending) {
      return this.finish(
        interactionId,
        this.formatter.noPendingConfirmation(),
        "ERROR",
        timing,
        totalStart,
        null,
      );
    }
    this.actions.cancel(pending.taskId);
    this.context.clearPending();
    return this.finish(
      interactionId,
      this.formatter.cancelled(pending.taskId),
      "IDLE",
      timing,
      totalStart,
      pending.plan.actionType,
      "CANCELLED",
      "cancelled",
    );
  }

  private async handleNewIntent(
    text: string,
    interactionId: string,
    timing: InteractionTiming,
    totalStart: number,
  ): Promise<ProcessInputResult> {
    this.state = "UNDERSTANDING";

    const environment = await this.loadEnvironmentHints(text);
    const prepared = await this.conversation.prepareTurn(text, environment);
    timing.conversationMs = prepared.timing.totalConversationMs;
    this.lastUserMessageId = prepared.userMessage.id;

    if (prepared.earlyClarification) {
      const earlyOutcome = {
        kind: "needs_clarification" as const,
        intent: {
          type: "needs_clarification" as const,
          payload: { question: prepared.earlyClarification },
        },
      };
      const decided = this.decisionEngine.evaluate({
        userText: text,
        effectiveText: prepared.effectiveText,
        outcome: earlyOutcome,
        referenceResult: prepared.bundle.referenceResult,
        environment,
        memoryUsed: prepared.bundle.memoryHints.length > 0,
        contextUsed: Boolean(environment),
        memoryPreferenceHints: prepared.bundle.memoryHints.map((m) => m.content.slice(0, 80)),
      });
      timing.decisionMs = decided.timing.totalDecisionMs;
      this.lastDecision = decided.decision;
      this.conversation.noteClarification();
      return this.finish(
        interactionId,
        this.formatter.clarification(
          decided.decision.clarificationQuestion ??
            prepared.earlyClarification,
        ),
        "IDLE",
        timing,
        totalStart,
        "needs_clarification",
        "NEEDS_CLARIFICATION",
      );
    }

    const requestExtras = toLlmExtras(prepared.bundle);
    const effectiveText = prepared.effectiveText;

    const llmStart = this.now();
    const outcome = await this.router.understand(effectiveText, requestExtras);
    timing.llmMs = this.now() - llmStart;

    const decided = this.decisionEngine.evaluate({
      userText: text,
      effectiveText,
      outcome,
      referenceResult: prepared.bundle.referenceResult,
      environment,
      memoryUsed: prepared.bundle.memoryHints.length > 0,
      contextUsed: Boolean(environment),
      memoryPreferenceHints: prepared.bundle.memoryHints.map((m) =>
        m.content.slice(0, 80),
      ),
      securityLevel:
        outcome.kind === "security" ? outcome.intent.type : null,
    });
    timing.decisionMs = decided.timing.totalDecisionMs;
    this.lastDecision = decided.decision;
    const decision = decided.decision;

    if (decision.type === "DEFER" || outcome.kind === "provider_error") {
      if (outcome.kind === "provider_error") {
        const resp =
          outcome.status === "UNAVAILABLE" || outcome.status === "TIMEOUT"
            ? this.formatter.llmUnavailable(outcome.message)
            : this.formatter.error(outcome.status, outcome.message);
        return this.finish(
          interactionId,
          resp,
          "ERROR",
          timing,
          totalStart,
          null,
          outcome.status,
        );
      }
      return this.finish(
        interactionId,
        this.formatter.unavailable(decision.messageHint ?? "Différé."),
        "ERROR",
        timing,
        totalStart,
        decision.sourceIntentKind ?? null,
        "DEFER",
      );
    }

    if (decision.type === "REFUSAL" || outcome.kind === "rejected") {
      const code =
        outcome.kind === "rejected" ? outcome.code : "REFUSAL";
      const message =
        decision.messageHint ??
        (outcome.kind === "rejected" ? outcome.message : "Refusé.");
      return this.finish(
        interactionId,
        this.formatter.error(code, message),
        "ERROR",
        timing,
        totalStart,
        null,
        code,
      );
    }

    if (
      decision.type === "CLARIFICATION" ||
      decision.type === "INFORMATION_REQUIRED"
    ) {
      this.conversation.noteClarification();
      return this.finish(
        interactionId,
        this.formatter.clarification(
          decision.clarificationQuestion ??
            decision.messageHint ??
            "Précise la cible.",
        ),
        "IDLE",
        timing,
        totalStart,
        "needs_clarification",
        decision.type,
      );
    }

    if (decision.type === "ANSWER") {
      if (outcome.kind === "context") {
        return this.handleContextIntent(
          outcome.intent.type as ContextQueryKind,
          interactionId,
          timing,
          totalStart,
        );
      }
      if (outcome.kind === "security") {
        return this.handleSecurityIntent(
          outcome.intent.type,
          interactionId,
          timing,
          totalStart,
        );
      }
      if (outcome.kind === "memory") {
        return this.handleMemoryIntent(
          outcome.intent,
          interactionId,
          timing,
          totalStart,
        );
      }
      if (outcome.kind === "conversation") {
        const resp = /^(bonjour|salut|hello|hi)\b/i.test(text)
          ? this.formatter.greeting()
          : this.formatter.conversation(
              outcome.intent.payload.replyHint ?? decision.messageHint,
            );
        return this.finish(
          interactionId,
          resp,
          "IDLE",
          timing,
          totalStart,
          "conversation",
          "OK",
        );
      }
      return this.finish(
        interactionId,
        this.formatter.conversation(decision.messageHint),
        "IDLE",
        timing,
        totalStart,
        decision.sourceIntentKind ?? "conversation",
        "OK",
      );
    }

    if (decision.type === "NO_ACTION") {
      return this.finish(
        interactionId,
        this.formatter.noAction(decision.messageHint),
        "IDLE",
        timing,
        totalStart,
        "no_action",
        "NO_ACTION",
      );
    }

    // ACTION only — still must pass ActionPlanner / Permission / Confirmation
    if (decision.type !== "ACTION" || outcome.kind !== "action") {
      return this.finish(
        interactionId,
        this.formatter.noAction("Aucune action décidée."),
        "IDLE",
        timing,
        totalStart,
        "no_action",
        "NO_ACTION",
      );
    }

    // Track entities from understood action intent (info only — not authorization)
    this.conversation.trackFromIntent(
      outcome.intent.type,
      outcome.intent.payload as Record<string, unknown>,
      prepared.userMessage.id,
    );

    // Action → plan + confirmation (never execute here)
    this.state = "PLANNING";
    const planStart = this.now();
    const planned = await this.router.planFromText(effectiveText, {
      requestExtras,
    });
    timing.planningMs = this.now() - planStart;

    if (!planned.ok) {
      const code = planned.error.code ?? RUNTIME_ERROR_CODES.PLAN_FAILED;
      if (code === "DENIED" || code.includes("DENIED")) {
        return this.finish(
          interactionId,
          this.formatter.denied(planned.error.message),
          "ERROR",
          timing,
          totalStart,
          outcome.intent.type,
          code,
        );
      }
      if (code === "UNAVAILABLE") {
        return this.finish(
          interactionId,
          this.formatter.unavailable(planned.error.message),
          "ERROR",
          timing,
          totalStart,
          outcome.intent.type,
          code,
        );
      }
      return this.finish(
        interactionId,
        this.formatter.error(
          code,
          planned.error.message ?? "Impossible de planifier",
        ),
        "ERROR",
        timing,
        totalStart,
        outcome.intent.type,
        code,
      );
    }

    if (!planned.plan) {
      return this.finish(
        interactionId,
        this.formatter.error(
          RUNTIME_ERROR_CODES.PLAN_FAILED,
          "Impossible de planifier",
        ),
        "ERROR",
        timing,
        totalStart,
        outcome.intent.type,
        RUNTIME_ERROR_CODES.PLAN_FAILED,
      );
    }

    const plan = planned.plan;
    const issued = this.actions.requestConfirmation(plan.taskId);
    if (!issued.success || !issued.data) {
      const code = issued.error?.code ?? RUNTIME_ERROR_CODES.ERROR;
      if (code === "DENIED") {
        return this.finish(
          interactionId,
          this.formatter.denied(issued.error?.message),
          "ERROR",
          timing,
          totalStart,
          plan.actionType,
          code,
        );
      }
      return this.finish(
        interactionId,
        this.formatter.error(
          code,
          issued.error?.message ?? "Confirmation impossible",
        ),
        "ERROR",
        timing,
        totalStart,
        plan.actionType,
        code,
      );
    }

    this.context.setPending({
      taskId: plan.taskId,
      token: issued.data.token,
      plan,
      message: issued.data.request.message,
      expiresAt: issued.data.token.expiresAt,
      issuedAt: this.now(),
    });
    this.state = "WAITING_CONFIRMATION";

    const resp = this.formatter.confirmationRequired(
      plan,
      issued.data.request.message,
      issued.data.token.expiresAt,
    );
    return this.finish(
      interactionId,
      resp,
      "WAITING_CONFIRMATION",
      timing,
      totalStart,
      plan.actionType,
      "CONFIRMATION_REQUIRED",
      "issued",
    );
  }

  private async loadEnvironmentHints(text: string): Promise<
    | {
        activeApplication?: string | null;
        openApplications?: string[];
      }
    | undefined
  > {
    if (!this.contextService) return undefined;
    const needsEnv =
      /application ouverte|qu['']est[- ]ce qui est ouvert|ferme[- ]le|ouvre[- ]le/i.test(
        text,
      );
    if (!needsEnv) return undefined;
    try {
      const snap = await this.contextService.getSnapshot("application.status");
      const active = snap.snapshot.applications?.active?.name ?? null;
      const open =
        snap.snapshot.applications?.running
          ?.map((a) => a.name)
          .filter((n): n is string => Boolean(n)) ?? [];
      return {
        activeApplication: active,
        openApplications: open,
      };
    } catch {
      return undefined;
    }
  }

  private finish(
    interactionId: string,
    response: JarvisResponse,
    nextState: RuntimeState,
    timing: InteractionTiming,
    totalStart: number,
    intentType: string | null,
    resultCode: string | null = null,
    confirmationStatus: string | null = null,
    executionStatus: string | null = null,
  ): ProcessInputResult {
    timing.totalMs = Math.max(0, this.now() - totalStart);

    const previousState = this.state;
    if (nextState === "WAITING_CONFIRMATION") {
      this.state = "WAITING_CONFIRMATION";
    } else if (
      nextState === "COMPLETED" ||
      nextState === "ERROR" ||
      nextState === "IDLE"
    ) {
      this.state = "IDLE";
    } else {
      this.state = nextState;
    }

    if (this.sophieIntegration && previousState !== this.state) {
      this.sophieIntegration.notifyStateChanged(this.state, previousState);
    }

    const pending = this.context.getPending();
    const cliText = this.formatter.formatCli(response);
    this.conversation.appendAssistant(cliText, {
      intentType: intentType ?? undefined,
      status: resultCode ?? undefined,
    });
    this.context.setLastExchange(this.lastUserMessageId ?? "", cliText);

    this.audit.append({
      timestamp: new Date(this.now()).toISOString(),
      interactionId,
      messageId: this.lastUserMessageId,
      role: "user",
      intentType,
      planStatus:
        pending?.plan.status ??
        (response.type === "executed" ? "COMPLETED" : null),
      risk: pending?.plan.riskLevel ?? null,
      confirmationStatus,
      executionStatus:
        executionStatus ??
        (response.type === "executed"
          ? "COMPLETED"
          : response.type === "cancelled"
            ? "CANCELLED"
            : response.type === "error"
              ? "ERROR"
              : null),
      resultCode,
      latencyMs: timing.totalMs,
      state: this.state,
    });

    return {
      response,
      state: this.state,
      timing,
      interactionId,
    };
  }
}

function toLlmExtras(
  bundle: import("../conversation/index.js").ConversationUnderstandBundle,
): Omit<LLMUnderstandRequest, "text"> {
  return {
    conversation: bundle.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    conversationSummary: bundle.summary?.text ?? null,
    references: bundle.references.map((r) => ({
      label: r.label ?? "",
      entityType: r.entityType,
      confidence: r.confidence,
    })),
    memory: bundle.memoryHints.map((m) => ({
      kind: m.kind,
      content: m.content,
    })),
    environment: bundle.environment,
  };
}

export function formatTiming(timing: InteractionTiming): string {
  const lines = ["Interaction", "────────────────────────"];
  if (timing.conversationMs != null) {
    lines.push(`Conversation  ${(timing.conversationMs / 1000).toFixed(2)}s`);
  }
  if (timing.llmMs !== null) {
    lines.push(`LLM          ${(timing.llmMs / 1000).toFixed(2)}s`);
  }
  if (timing.decisionMs != null) {
    lines.push(`Decision     ${timing.decisionMs}ms`);
  }
  if (timing.validationMs !== null) {
    lines.push(`Validation   ${timing.validationMs}ms`);
  }
  if (timing.planningMs !== null) {
    lines.push(`Planning     ${timing.planningMs}ms`);
  }
  if (timing.confirmationMs !== null) {
    lines.push(`Confirmation ${timing.confirmationMs}ms`);
  }
  if (timing.executionMs !== null) {
    lines.push(`Execution    ${timing.executionMs}ms`);
  }
  lines.push(`Total        ${(timing.totalMs / 1000).toFixed(2)}s`);
  return lines.join("\n");
}

export type { ConversationTiming };
