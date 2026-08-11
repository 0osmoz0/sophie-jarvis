import type {
  LLMCapabilityReport,
  LLMUnderstandRequest,
  LLMUnderstandResult,
  LLMResponseGenerateRequest,
  LLMResponseGenerateResult,
} from "./types.js";

/**
 * LLMProvider — understanding + optional natural response wording.
 * Must never execute tools, shell, filesystem, or system APIs.
 * generateResponse explains only; never decides permissions.
 */
export interface LLMProvider {
  readonly name: string;

  getCapabilityStatus(): LLMCapabilityReport;

  /**
   * Produce an untrusted candidate structure from user text.
   * Caller MUST validate with IntentValidator before any planning.
   */
  understand(request: LLMUnderstandRequest): Promise<LLMUnderstandResult>;

  /**
   * Phase 19 — produce natural-language wording from structured facts.
   * Optional for older providers; ResponseGenerator falls back if absent.
   * Must never invent action/context results not present in the request.
   */
  generateResponse?(
    request: LLMResponseGenerateRequest,
  ): Promise<LLMResponseGenerateResult>;
}
