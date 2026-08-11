import { randomUUID } from "node:crypto";
import type { IntentRouterOutcome } from "../ai/types.js";
import type { ReferenceResolveResult } from "../conversation/types.js";
import type { EnvironmentHints } from "../conversation/ReferenceResolver.js";
import { ContradictionDetector } from "./ContradictionDetector.js";
import { DecisionPolicy } from "./DecisionPolicy.js";
import { DecisionValidator } from "./DecisionValidator.js";
import {
  MemoryDecisionAuditLog,
  toAuditEntry,
  type DecisionAuditSink,
} from "./DecisionAuditLog.js";
import type {
  Decision,
  DecisionEvidence,
  DecisionTiming,
  DecisionType,
} from "./types.js";
import {
  clampConfidence,
  confidenceCategory,
} from "./types.js";

export interface DecisionInput {
  userText: string;
  effectiveText: string;
  outcome: IntentRouterOutcome;
  referenceResult?: ReferenceResolveResult;
  environment?: EnvironmentHints;
  /** Soft memory preference labels (not full content for audit). */
  memoryPreferenceHints?: string[];
  memoryUsed?: boolean;
  contextUsed?: boolean;
  recentUserTexts?: string[];
  /** Optional security level label (informational). */
  securityLevel?: string | null;
  now?: number;
}

export interface DecisionResult {
  decision: Decision;
  timing: DecisionTiming;
  validationOk: boolean;
  validationMessage?: string;
}

/**
 * DecisionEngine — evaluates whether an interpretation is well-founded.
 * Never calls ActionExecutor / PermissionManager / ActionConfirmation.
 */
export class DecisionEngine {
  private readonly policy: DecisionPolicy;
  private readonly validator: DecisionValidator;
  private readonly contradictions: ContradictionDetector;
  private readonly audit: DecisionAuditSink;
  private readonly now: () => number;

  constructor(options?: {
    policy?: DecisionPolicy;
    validator?: DecisionValidator;
    contradictions?: ContradictionDetector;
    audit?: DecisionAuditSink;
    now?: () => number;
  }) {
    this.policy = options?.policy ?? new DecisionPolicy();
    this.validator = options?.validator ?? new DecisionValidator();
    this.contradictions =
      options?.contradictions ?? new ContradictionDetector();
    this.audit = options?.audit ?? new MemoryDecisionAuditLog();
    this.now = options?.now ?? (() => Date.now());
  }

  getAudit(): DecisionAuditSink {
    return this.audit;
  }

  evaluate(input: DecisionInput): DecisionResult {
    const t0 = this.now();
    const timing: DecisionTiming = {
      decisionMs: 0,
      validationMs: 0,
      memoryMs: 0,
      contextMs: 0,
      totalDecisionMs: 0,
    };

    const memStart = this.now();
    const memoryUsed = input.memoryUsed === true;
    timing.memoryMs = this.now() - memStart;

    const ctxStart = this.now();
    const contextUsed =
      input.contextUsed === true || Boolean(input.environment);
    timing.contextMs = this.now() - ctxStart;

    const decideStart = this.now();
    let decision = this.buildDecision(input, memoryUsed, contextUsed);
    timing.decisionMs = this.now() - decideStart;

    const valStart = this.now();
    // Policy gate for ACTION
    if (decision.type === "ACTION") {
      const gate = this.policy.canProposeAction(decision);
      if (!gate.ok) {
        decision = {
          ...decision,
          type: this.policy.downgradeAction(
            "ACTION",
            decision.confidenceCategory,
            decision.missingInformation,
          ),
          requiresClarification: true,
          requiresConfirmation: false,
          actionIntent: undefined,
          clarificationQuestion:
            decision.clarificationQuestion ??
            minimalClarification(decision.missingInformation),
          reasons: [
            ...decision.reasons,
            `Action gated: ${gate.reason ?? "policy"}`,
          ],
        };
      } else {
        // ACTION candidates always require Phase 8 confirmation path in runtime
        decision = {
          ...decision,
          requiresConfirmation: true,
        };
      }
    }

    const validated = this.validator.validate(decision);
    timing.validationMs = this.now() - valStart;
    timing.totalDecisionMs = this.now() - t0;

    if (!validated.ok) {
      decision = {
        ...decision,
        type: "REFUSAL",
        requiresClarification: false,
        requiresConfirmation: false,
        actionIntent: undefined,
        reasons: [
          ...decision.reasons,
          `Decision validation failed: ${validated.message}`,
        ],
        messageHint: validated.message ?? "Décision invalide",
      };
    }

    this.audit.append(
      toAuditEntry(
        decision,
        timing.totalDecisionMs,
        validated.ok ? "ok" : validated.code ?? "invalid",
        new Date(this.now()).toISOString(),
      ),
    );

    return {
      decision,
      timing,
      validationOk: validated.ok || decision.type === "REFUSAL",
      validationMessage: validated.message,
    };
  }

  private buildDecision(
    input: DecisionInput,
    memoryUsed: boolean,
    contextUsed: boolean,
  ): Decision {
    const evidence: DecisionEvidence[] = [
      {
        source: "explicit_user_message",
        summary: "Current user message considered first",
        weight: 1,
      },
    ];

    const appFromOutcome = extractApplication(input.outcome);
    const contradiction = this.contradictions.detect({
      currentText: input.userText,
      recentUserTexts: input.recentUserTexts,
      memoryPreferenceHints: input.memoryPreferenceHints,
      currentApplication: appFromOutcome,
    });

    if (contradiction.detected && contradiction.kind === "user_correction") {
      evidence.push({
        source: "user_correction",
        summary: contradiction.notes[0] ?? "User correction applied",
        weight: 0.95,
      });
    }
    if (
      contradiction.detected &&
      contradiction.kind === "memory_vs_explicit"
    ) {
      evidence.push({
        source: "memory",
        summary: contradiction.notes[0] ?? "Memory differs; explicit wins",
        weight: 0.3,
      });
      evidence.push({
        source: "explicit_user_message",
        summary: `Explicit request wins: ${contradiction.resolvedApplication}`,
        weight: 1,
      });
    }

    const ref = input.referenceResult;
    if (ref && ref.status !== "none") {
      evidence.push({
        source: "conversation_reference",
        summary: `Reference ${ref.status}${ref.entity ? `: ${ref.entity.label}` : ""}`,
        weight: ref.resolved ? 0.9 : 0.4,
      });
    }
    if (contextUsed && input.environment) {
      evidence.push({
        source: "environment",
        summary: envSummary(input.environment),
        weight: 0.5,
      });
    }
    if (memoryUsed) {
      evidence.push({
        source: "memory",
        summary: "Relevant memory consulted",
        weight: 0.45,
      });
    }
    if (input.securityLevel) {
      evidence.push({
        source: "security_context",
        summary: `Security level=${input.securityLevel} (informational)`,
        weight: 0.2,
      });
    }

    // Early reference ambiguity / unresolved — before trusting LLM action
    if (ref?.status === "ambiguous") {
      const labels =
        ref.candidates?.map((c) => c.label).filter(Boolean) ?? [];
      return baseDecision({
        type: "CLARIFICATION",
        confidence: 0.55,
        reasons: ["Ambiguous conversational reference"],
        evidence,
        missingInformation: ["target_entity"],
        requiresClarification: true,
        clarificationQuestion: minimalChoice(labels),
        memoryUsed,
        contextUsed,
        contradictionDetected: contradiction.detected,
        sourceIntentKind: "needs_clarification",
        origin: "USER_REQUESTED",
      });
    }
    if (ref?.status === "unresolved") {
      return baseDecision({
        type: "INFORMATION_REQUIRED",
        confidence: 0.4,
        reasons: ["Reference could not be resolved"],
        evidence,
        missingInformation: ["target_entity"],
        requiresClarification: true,
        clarificationQuestion: "Précise la cible (chemin ou application).",
        memoryUsed,
        contextUsed,
        contradictionDetected: contradiction.detected,
        sourceIntentKind: "needs_clarification",
        origin: "USER_REQUESTED",
      });
    }

    if (contradiction.kind === "keep_open_vs_close") {
      return baseDecision({
        type: "NO_ACTION",
        confidence: 0.88,
        reasons: contradiction.notes,
        evidence,
        missingInformation: [],
        requiresClarification: false,
        messageHint: "D'accord, je ne ferme rien.",
        memoryUsed,
        contextUsed,
        contradictionDetected: true,
        sourceIntentKind: "no_action",
        origin: "USER_REQUESTED",
      });
    }

    const outcome = input.outcome;

    if (outcome.kind === "provider_error") {
      return baseDecision({
        type: "DEFER",
        confidence: 0.3,
        reasons: [`Provider error: ${outcome.status}`],
        evidence: [
          ...evidence,
          {
            source: "llm_inference",
            summary: "LLM unavailable or failed",
            weight: 0.1,
          },
        ],
        missingInformation: ["llm_availability"],
        requiresClarification: false,
        messageHint: outcome.message,
        memoryUsed,
        contextUsed,
        contradictionDetected: contradiction.detected,
        sourceIntentKind: "provider_error",
        origin: "USER_REQUESTED",
      });
    }

    if (outcome.kind === "rejected") {
      return baseDecision({
        type: "REFUSAL",
        confidence: 0.9,
        reasons: [outcome.message],
        evidence: [
          ...evidence,
          {
            source: "intent_validation",
            summary: `Rejected: ${outcome.code}`,
            weight: 1,
          },
        ],
        missingInformation: [],
        requiresClarification: false,
        messageHint: outcome.message,
        memoryUsed,
        contextUsed,
        contradictionDetected: contradiction.detected,
        sourceIntentKind: "rejected",
        origin: "USER_REQUESTED",
      });
    }

    if (outcome.kind === "needs_clarification") {
      return baseDecision({
        type: "CLARIFICATION",
        confidence: 0.6,
        reasons: ["LLM / router requested clarification"],
        evidence: [
          ...evidence,
          {
            source: "llm_inference",
            summary: "needs_clarification intent",
            weight: 0.5,
          },
        ],
        missingInformation: ["unspecified"],
        requiresClarification: true,
        clarificationQuestion: outcome.intent.payload.question,
        memoryUsed,
        contextUsed,
        contradictionDetected: contradiction.detected,
        sourceIntentKind: "needs_clarification",
        origin: "USER_REQUESTED",
      });
    }

    if (outcome.kind === "conversation") {
      return baseDecision({
        type: "ANSWER",
        confidence: 0.85,
        reasons: ["Conversational / non-actionable chat"],
        evidence: [
          ...evidence,
          {
            source: "llm_inference",
            summary: "conversation intent",
            weight: 0.7,
          },
        ],
        missingInformation: [],
        requiresClarification: false,
        messageHint: outcome.intent.payload.replyHint,
        memoryUsed,
        contextUsed,
        contradictionDetected: contradiction.detected,
        sourceIntentKind: "conversation",
        origin: "USER_REQUESTED",
      });
    }

    if (outcome.kind === "no_action") {
      return baseDecision({
        type: "NO_ACTION",
        confidence: 0.8,
        reasons: [outcome.intent.payload.reason ?? "No actionable intent"],
        evidence: [
          ...evidence,
          {
            source: "llm_inference",
            summary: "no_action intent",
            weight: 0.7,
          },
        ],
        missingInformation: [],
        requiresClarification: false,
        messageHint: outcome.intent.payload.reason,
        memoryUsed,
        contextUsed,
        contradictionDetected: contradiction.detected,
        sourceIntentKind: "no_action",
        origin: "USER_REQUESTED",
      });
    }

    if (outcome.kind === "context") {
      return baseDecision({
        type: "ANSWER",
        confidence: 0.9,
        reasons: ["Read-only context query"],
        evidence: [
          ...evidence,
          {
            source: "environment",
            summary: `Context intent ${outcome.intent.type}`,
            weight: 0.85,
          },
        ],
        missingInformation: [],
        requiresClarification: false,
        messageHint: outcome.intent.type,
        memoryUsed,
        contextUsed: true,
        contradictionDetected: contradiction.detected,
        sourceIntentKind: "context",
        origin: "USER_REQUESTED",
      });
    }

    if (outcome.kind === "security") {
      return baseDecision({
        type: "ANSWER",
        confidence: 0.88,
        reasons: ["Read-only security assessment"],
        evidence: [
          ...evidence,
          {
            source: "security_context",
            summary: `Security intent ${outcome.intent.type}`,
            weight: 0.8,
          },
        ],
        missingInformation: [],
        requiresClarification: false,
        messageHint: outcome.intent.type,
        memoryUsed,
        contextUsed,
        contradictionDetected: contradiction.detected,
        sourceIntentKind: "security",
        origin: "USER_REQUESTED",
      });
    }

    if (outcome.kind === "memory") {
      return baseDecision({
        type: "ANSWER",
        confidence: 0.86,
        reasons: ["Memory intent (inform only)"],
        evidence: [
          ...evidence,
          {
            source: "memory",
            summary: `Memory intent ${outcome.intent.type}`,
            weight: 0.8,
          },
        ],
        missingInformation: [],
        requiresClarification: false,
        messageHint: outcome.intent.type,
        memoryUsed: true,
        contextUsed,
        contradictionDetected: contradiction.detected,
        sourceIntentKind: "memory",
        origin: "USER_REQUESTED",
      });
    }

    // ACTION path
    if (outcome.kind === "action") {
      const payload = outcome.intent.payload as Record<string, unknown>;
      const missing = missingActionFields(outcome.intent.type, payload);
      let confidence = 0.92;
      if (ref?.resolved) confidence = Math.min(0.97, confidence + 0.03);
      if (contradiction.kind === "user_correction") confidence = 0.94;
      if (missing.length) confidence = Math.min(confidence, 0.45);

      // Injection-like soft downgrade already handled by rejected/no_action usually
      evidence.push({
        source: "llm_inference",
        summary: `Action intent ${outcome.intent.type}`,
        weight: 0.75,
      });
      evidence.push({
        source: "intent_validation",
        summary: "Intent passed IntentValidator",
        weight: 0.9,
      });

      if (missing.length) {
        return baseDecision({
          type: "INFORMATION_REQUIRED",
          confidence,
          reasons: ["Action payload incomplete"],
          evidence,
          missingInformation: missing,
          requiresClarification: true,
          clarificationQuestion: minimalMissingQuestion(missing),
          memoryUsed,
          contextUsed,
          contradictionDetected: contradiction.detected,
          sourceIntentKind: "action",
          origin: "USER_REQUESTED",
        });
      }

      return baseDecision({
        type: "ACTION",
        confidence,
        reasons: [
          `User-requested action ${outcome.intent.type}`,
          ...(contradiction.kind === "memory_vs_explicit"
            ? ["Explicit user choice overrides memory preference"]
            : []),
        ],
        evidence,
        missingInformation: [],
        requiresClarification: false,
        requiresConfirmation: true,
        actionIntent: {
          type: outcome.intent.type,
          payload,
        },
        riskLevel: null,
        memoryUsed,
        contextUsed,
        contradictionDetected: contradiction.detected,
        sourceIntentKind: "action",
        origin: "USER_REQUESTED",
      });
    }

    return baseDecision({
      type: "NO_ACTION",
      confidence: 0.5,
      reasons: ["Unhandled outcome"],
      evidence,
      missingInformation: [],
      requiresClarification: false,
      memoryUsed,
      contextUsed,
      contradictionDetected: contradiction.detected,
      sourceIntentKind: null,
      origin: "USER_REQUESTED",
    });
  }
}

function baseDecision(
  partial: {
    type: Decision["type"];
    confidence: number;
    reasons: string[];
    evidence: DecisionEvidence[];
    missingInformation: string[];
    riskLevel?: string | null;
    requiresClarification: boolean;
    requiresConfirmation?: boolean;
    actionIntent?: Decision["actionIntent"];
    clarificationQuestion?: string;
    messageHint?: string;
    origin: Decision["origin"];
    sourceIntentKind?: string | null;
    expiresAt?: number;
    memoryUsed: boolean;
    contextUsed: boolean;
    contradictionDetected: boolean;
  },
): Decision {
  const confidence = clampConfidence(partial.confidence);
  return {
    id: `dec_${randomUUID()}`,
    type: partial.type,
    confidence,
    confidenceCategory: confidenceCategory(confidence),
    reasons: partial.reasons,
    evidence: partial.evidence,
    missingInformation: partial.missingInformation,
    riskLevel: partial.riskLevel ?? null,
    requiresClarification: partial.requiresClarification,
    requiresConfirmation: partial.requiresConfirmation ?? false,
    actionIntent: partial.actionIntent,
    clarificationQuestion: partial.clarificationQuestion,
    messageHint: partial.messageHint,
    origin: partial.origin,
    sourceIntentKind: partial.sourceIntentKind,
    expiresAt: partial.expiresAt,
    memoryUsed: partial.memoryUsed,
    contextUsed: partial.contextUsed,
    contradictionDetected: partial.contradictionDetected,
  };
}

function extractApplication(outcome: IntentRouterOutcome): string | null {
  if (outcome.kind !== "action") return null;
  const p = outcome.intent.payload as Record<string, unknown>;
  return typeof p.application === "string" ? p.application : null;
}

function envSummary(env: EnvironmentHints): string {
  const active = env.activeApplication ?? "none";
  const n = env.openApplications?.length ?? 0;
  return `active=${active}; openCount=${n}`;
}

function missingActionFields(
  type: string,
  payload: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  if (type.startsWith("application.") && !payload.application) {
    missing.push("application");
  }
  if (type === "file.delete" && !payload.path) missing.push("path");
  if (type === "file.create" && !payload.path) missing.push("path");
  if (
    (type === "file.copy" || type === "file.move") &&
    (!payload.source || !payload.destination)
  ) {
    if (!payload.source) missing.push("source");
    if (!payload.destination) missing.push("destination");
  }
  return missing;
}

function minimalChoice(labels: string[]): string {
  if (labels.length === 2) return `${labels[0]} ou ${labels[1]} ?`;
  if (labels.length > 2) return `Lequel : ${labels.slice(0, 4).join(", ")} ?`;
  return "Précise la cible.";
}

function minimalClarification(missing: string[]): string {
  if (missing.includes("application")) return "Quelle application ?";
  if (missing.includes("path")) return "Quel fichier ?";
  if (missing.includes("source") || missing.includes("destination")) {
    return "Tu veux le déplacer ou le copier ?";
  }
  return "Précise la cible.";
}

function minimalMissingQuestion(missing: string[]): string {
  return minimalClarification(missing);
}

/** Relevance helper — avoid pointless memory recalls. */
export function shouldConsultMemory(userText: string): boolean {
  return /quel(?:le)?\s+(?:est|sont)|préfér|aime|souviens|remember|ide|éditeur|musique|projet principal/i.test(
    userText,
  );
}

export type { DecisionType };
