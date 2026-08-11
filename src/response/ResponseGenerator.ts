import { randomUUID } from "node:crypto";
import type { LLMProvider } from "../ai/LLMProvider.js";
import { ResponsePolicy } from "./ResponsePolicy.js";
import { ResponseValidator } from "./ResponseValidator.js";
import { ResponseDraftFormatter } from "./ResponseFormatter.js";
import {
  MemoryResponseAuditLog,
  type ResponseAuditSink,
} from "./ResponseAuditLog.js";
import type {
  ResponseDraft,
  ResponseGenerateRequest,
  ResponseTiming,
} from "./types.js";
import { RESPONSE_MEMORY_BUDGET } from "./types.js";

export interface ResponseGeneratorOptions {
  provider?: LLMProvider;
  policy?: ResponsePolicy;
  validator?: ResponseValidator;
  formatter?: ResponseDraftFormatter;
  audit?: ResponseAuditSink;
  now?: () => number;
  /** When false, never call LLM — deterministic only. */
  enableLlm?: boolean;
}

export interface ResponseGenerateResult {
  draft: ResponseDraft;
  timing: ResponseTiming;
}

/**
 * ResponseGenerator — explains results in natural language.
 * Never executes actions or grants permissions.
 */
export class ResponseGenerator {
  private readonly provider: LLMProvider | undefined;
  private readonly policy: ResponsePolicy;
  private readonly validator: ResponseValidator;
  private readonly formatter: ResponseDraftFormatter;
  private readonly audit: ResponseAuditSink;
  private readonly now: () => number;
  private readonly enableLlm: boolean;

  constructor(options: ResponseGeneratorOptions = {}) {
    this.provider = options.provider;
    this.policy = options.policy ?? new ResponsePolicy();
    this.validator = options.validator ?? new ResponseValidator();
    this.formatter = options.formatter ?? new ResponseDraftFormatter();
    this.audit = options.audit ?? new MemoryResponseAuditLog();
    this.now = options.now ?? (() => Date.now());
    this.enableLlm = options.enableLlm !== false;
  }

  getAudit(): ResponseAuditSink {
    return this.audit;
  }

  async generate(
    request: ResponseGenerateRequest,
  ): Promise<ResponseGenerateResult> {
    const t0 = this.now();
    const timing: ResponseTiming = {
      policyMs: 0,
      llmMs: null,
      validationMs: 0,
      formattingMs: 0,
      totalMs: 0,
    };

    const p0 = this.now();
    const policy = this.policy.resolve(request);
    timing.policyMs = this.now() - p0;

    const f0 = this.now();
    const fallbackText = this.formatter.fallback(request);
    timing.formattingMs = this.now() - f0;

    let text = fallbackText;
    let usedLlm = false;
    let confidence = 0.82;

    const canLlm =
      this.enableLlm &&
      policy.allowLlm &&
      this.provider &&
      typeof this.provider.generateResponse === "function";

    if (canLlm) {
      const llmStart = this.now();
      try {
        const llm = await this.provider!.generateResponse!({
          userMessage: request.userMessage,
          category: request.category,
          fallbackText,
          facts: request.facts,
          decisionType: request.decisionType ?? null,
          actionResult: request.actionResult ?? null,
          contextResult: request.contextResult ?? null,
          memory: trimMemory(request.memoryHints),
          securityAssessment: request.securityAssessment ?? null,
          errors: request.errors ?? [],
          styleNotes: policy.styleNotes,
          maxChars: policy.maxChars,
        });
        timing.llmMs = this.now() - llmStart;
        if (llm.ok && llm.text.trim()) {
          text = llm.text.trim();
          usedLlm = true;
          confidence = Math.min(0.95, llm.confidence ?? 0.88);
        }
      } catch {
        timing.llmMs = this.now() - llmStart;
        // keep fallback
      }
    }

    let draft: ResponseDraft = {
      text,
      tone: policy.tone,
      source: usedLlm ? policy.source : "FALLBACK",
      confidence,
      facts: request.facts,
      warnings: [],
      category: policy.category,
      usedLlm,
    };

    const v0 = this.now();
    let validated = this.validator.validate(draft);
    timing.validationMs = this.now() - v0;

    if (!validated.ok) {
      draft = {
        ...draft,
        text: fallbackText,
        source: "FALLBACK",
        usedLlm: false,
        confidence: 0.75,
        warnings: [
          ...draft.warnings,
          `llm_rejected:${validated.code ?? "invalid"}`,
        ],
      };
      validated = this.validator.validate(draft);
      if (!validated.ok) {
        draft = {
          ...draft,
          text: "Je ne peux pas formuler une réponse sûre pour le moment.",
          warnings: [...draft.warnings, "fallback_sanitized"],
        };
      }
    }

    draft = this.formatter.finalize(draft, policy.maxChars);
    timing.totalMs = this.now() - t0;

    this.audit.append({
      timestamp: new Date(this.now()).toISOString(),
      responseId: `rsp_${randomUUID()}`,
      category: draft.category,
      source: draft.source,
      confidence: draft.confidence,
      usedLlm: draft.usedLlm,
      latencyMs: timing.totalMs,
      result: validated.ok ? "ok" : validated.code ?? "invalid",
      factKeys: draft.facts.map((f) => f.key).slice(0, 20),
    });

    return { draft, timing };
  }
}

function trimMemory(
  hints: ResponseGenerateRequest["memoryHints"],
): Array<{ kind: string; content: string }> {
  if (!hints?.length) return [];
  const out: Array<{ kind: string; content: string }> = [];
  let chars = 0;
  for (const h of hints) {
    if (out.length >= RESPONSE_MEMORY_BUDGET.maxMemories) break;
    const content = h.content.slice(0, 200);
    if (chars + content.length > RESPONSE_MEMORY_BUDGET.maxCharacters) break;
    out.push({ kind: h.kind, content });
    chars += content.length;
  }
  return out;
}
