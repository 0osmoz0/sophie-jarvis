import type {
  LLMCapabilityReport,
  LLMUnderstandRequest,
  LLMUnderstandResult,
} from "./types.js";

/**
 * LLMProvider — understanding only.
 * Must never execute tools, shell, filesystem, or system APIs.
 */
export interface LLMProvider {
  readonly name: string;

  getCapabilityStatus(): LLMCapabilityReport;

  /**
   * Produce an untrusted candidate structure from user text.
   * Caller MUST validate with IntentValidator before any planning.
   */
  understand(request: LLMUnderstandRequest): Promise<LLMUnderstandResult>;
}
