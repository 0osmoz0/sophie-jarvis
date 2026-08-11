import type { ActionService } from "../actions/ActionService.js";
import type { ActionIntent, ActionPlan, ActionResult } from "../actions/types.js";
import type { LLMProvider } from "./LLMProvider.js";
import { IntentValidator } from "./IntentValidator.js";
import type {
  IntentRouterOutcome,
  JarvisActionIntentType,
  JarvisContextIntentType,
  JarvisSecurityIntentType,
  JarvisMemoryIntentType,
  JarvisIntent,
  LLMUnderstandRequest,
} from "./types.js";
import {
  AI_ERROR_CODES,
  AI_LIMITS,
  JARVIS_CONTEXT_INTENT_TYPES,
  JARVIS_SECURITY_INTENT_TYPES,
  JARVIS_MEMORY_INTENT_TYPES,
} from "./types.js";

export interface IntentRouterOptions {
  provider: LLMProvider;
  validator?: IntentValidator;
  /** Optional ActionService — used only for planFromText, never by the LLM. */
  actions?: ActionService;
}

/**
 * IntentRouter — text → LLM → validate → (optional) ActionPlanner.
 * LLM never executes. Pipeline Phase 8 remains authoritative.
 */
export class IntentRouter {
  private readonly provider: LLMProvider;
  private readonly validator: IntentValidator;
  private readonly actions: ActionService | undefined;

  constructor(options: IntentRouterOptions) {
    this.provider = options.provider;
    this.validator = options.validator ?? new IntentValidator();
    this.actions = options.actions;
  }

  async understand(
    text: string,
    requestExtras?: Omit<LLMUnderstandRequest, "text">,
  ): Promise<IntentRouterOutcome> {
    if (typeof text !== "string") {
      return {
        kind: "rejected",
        code: AI_ERROR_CODES.INVALID_INTENT,
        message: "Input must be a string",
      };
    }
    if (text.length > AI_LIMITS.maxUserTextChars) {
      return {
        kind: "rejected",
        code: AI_ERROR_CODES.INPUT_TOO_LONG,
        message: `User text exceeds ${AI_LIMITS.maxUserTextChars} characters`,
      };
    }

    // No infinite retries — single understand call.
    const llm = await this.provider.understand({
      text,
      ...requestExtras,
    });
    if (!llm.ok) {
      return {
        kind: "provider_error",
        status: llm.status,
        message: llm.error,
      };
    }

    const validated = this.validator.validate(llm.candidate);
    if (!validated.ok) {
      return {
        kind: "rejected",
        code: validated.code,
        message: validated.message,
        raw: llm.raw,
      };
    }

    return classifyIntent(validated.intent);
  }

  /**
   * Understand + feed ActionService.plan for actionable intents only.
   * Never executes. Confirmation / Permission remain Phase 8.
   *
   * Prefer {@link planFromOutcome} when understand() already ran (Phase 20).
   */
  async planFromText(
    text: string,
    options?: {
      dryRun?: boolean;
      requestExtras?: Omit<LLMUnderstandRequest, "text">;
    },
  ): Promise<
    | { ok: true; outcome: IntentRouterOutcome; plan?: ActionPlan }
    | { ok: false; outcome: IntentRouterOutcome; error: { code: string; message: string } }
  > {
    const outcome = await this.understand(text, options?.requestExtras);
    return this.planFromOutcome(outcome, { dryRun: options?.dryRun });
  }

  /**
   * Phase 20 — plan from an already-validated IntentRouterOutcome.
   * Does NOT call LLM again (single-pass understanding).
   */
  planFromOutcome(
    outcome: IntentRouterOutcome,
    options?: { dryRun?: boolean },
  ):
    | { ok: true; outcome: IntentRouterOutcome; plan?: ActionPlan }
    | { ok: false; outcome: IntentRouterOutcome; error: { code: string; message: string } } {
    if (outcome.kind !== "action") {
      return {
        ok: false,
        outcome,
        error: {
          code:
            outcome.kind === "needs_clarification"
              ? AI_ERROR_CODES.NEEDS_CLARIFICATION
              : outcome.kind === "conversation" ||
                  outcome.kind === "no_action" ||
                  outcome.kind === "context" ||
                  outcome.kind === "security" ||
                  outcome.kind === "memory"
                ? AI_ERROR_CODES.NO_ACTION
                : outcome.kind === "provider_error"
                  ? outcome.status
                  : outcome.code,
          message:
            outcome.kind === "needs_clarification"
              ? outcome.intent.payload.question
              : outcome.kind === "context"
                ? "Context intent is read-only (not an action plan)"
              : outcome.kind === "security"
                ? "Security intent is read-only (not an action plan)"
              : outcome.kind === "memory"
                ? "Memory intent never becomes an executable action plan"
                : outcome.kind === "rejected"
                  ? outcome.message
                  : outcome.kind === "provider_error"
                    ? outcome.message
                    : "No actionable intent",
        },
      };
    }

    if (!this.actions) {
      return {
        ok: false,
        outcome,
        error: {
          code: AI_ERROR_CODES.ERROR,
          message: "ActionService not configured on IntentRouter",
        },
      };
    }

    const actionIntent = toActionIntent(outcome.intent);
    const planned = this.actions.plan(actionIntent, {
      dryRun: options?.dryRun,
    });
    if (!planned.success || !planned.data) {
      return {
        ok: false,
        outcome,
        error: {
          code: planned.error?.code ?? AI_ERROR_CODES.ERROR,
          message: planned.error?.message ?? "Plan failed",
        },
      };
    }

    return { ok: true, outcome, plan: planned.data };
  }
}

function classifyIntent(intent: JarvisIntent): IntentRouterOutcome {
  switch (intent.type) {
    case "conversation":
      return { kind: "conversation", intent };
    case "no_action":
      return { kind: "no_action", intent };
    case "needs_clarification":
      return { kind: "needs_clarification", intent };
    default:
      if (
        (JARVIS_CONTEXT_INTENT_TYPES as readonly string[]).includes(intent.type)
      ) {
        return {
          kind: "context",
          intent: intent as Extract<
            JarvisIntent,
            { type: JarvisContextIntentType }
          >,
        };
      }
      if (
        (JARVIS_SECURITY_INTENT_TYPES as readonly string[]).includes(intent.type)
      ) {
        return {
          kind: "security",
          intent: intent as Extract<
            JarvisIntent,
            { type: JarvisSecurityIntentType }
          >,
        };
      }
      if (
        (JARVIS_MEMORY_INTENT_TYPES as readonly string[]).includes(intent.type)
      ) {
        return {
          kind: "memory",
          intent: intent as Extract<
            JarvisIntent,
            { type: JarvisMemoryIntentType }
          >,
        };
      }
      return {
        kind: "action",
        intent: intent as Extract<
          JarvisIntent,
          { type: JarvisActionIntentType }
        >,
      };
  }
}

/** Map JarvisIntent → Phase 8 ActionIntent. */
export function toActionIntent(
  intent: Extract<JarvisIntent, { type: JarvisActionIntentType }>,
): ActionIntent {
  switch (intent.type) {
    case "file.copy":
      return {
        type: "FILE_COPY",
        payload: {
          source: intent.payload.source,
          destination: intent.payload.destination,
        },
      };
    case "file.move":
      return {
        type: "FILE_MOVE",
        payload: {
          source: intent.payload.source,
          destination: intent.payload.destination,
        },
      };
    case "file.create":
      return {
        type: "FILE_CREATE",
        payload: {
          path: intent.payload.path,
          content: intent.payload.content,
        },
      };
    case "file.delete":
      return {
        type: "FILE_DELETE",
        payload: { path: intent.payload.path },
      };
    case "application.open":
      return {
        type: "APP_OPEN",
        payload: { applicationId: intent.payload.application },
      };
    case "application.close":
      return {
        type: "APP_CLOSE",
        payload: { applicationId: intent.payload.application },
      };
  }
}

export type { ActionResult };
