import type {
  ResponseCategory,
  ResponseGenerateRequest,
  ResponseSourceCategory,
  ResponseTone,
} from "./types.js";

export interface ResponsePolicyResult {
  category: ResponseCategory;
  tone: ResponseTone;
  source: ResponseSourceCategory;
  /** Max characters for LLM / final text. */
  maxChars: number;
  /** Prefer fallback without calling LLM for high-stakes security paths. */
  allowLlm: boolean;
  styleNotes: string[];
}

/**
 * Deterministic policy — category is imposed by runtime, not the LLM.
 */
export class ResponsePolicy {
  resolve(request: ResponseGenerateRequest): ResponsePolicyResult {
    const category = request.category;
    const tone = toneFor(category);
    const source = sourceFor(category, request);
    const allowLlm = categoryAllowsLlm(category);
    return {
      category,
      tone,
      source,
      maxChars: category === "CLARIFICATION" ? 180 : 420,
      allowLlm,
      styleNotes: [
        "French, concise, natural",
        "No 'En tant qu'intelligence artificielle'",
        "Do not invent facts",
        ...styleFor(category),
      ],
    };
  }
}

function toneFor(category: ResponseCategory): ResponseTone {
  switch (category) {
    case "ACTION_SUCCESS":
    case "ANSWER":
    case "NO_ACTION":
      return "helpful";
    case "CLARIFICATION":
    case "ACTION_CONFIRMATION":
      return "concise";
    case "REFUSAL":
    case "ACTION_DENIED":
    case "ERROR":
    case "ACTION_FAILURE":
      return "cautious";
    case "ACTION_CANCELLED":
      return "warm";
    default:
      return "neutral";
  }
}

function sourceFor(
  category: ResponseCategory,
  request: ResponseGenerateRequest,
): ResponseSourceCategory {
  if (request.actionResult) return "ACTION_RESULT";
  if (request.contextResult) return "CONTEXT_RESULT";
  if (request.securityAssessment) return "SECURITY_ASSESSMENT";
  if (request.memoryHints?.length) return "MEMORY_RESULT";
  switch (category) {
    case "CLARIFICATION":
      return "CLARIFICATION";
    case "REFUSAL":
      return "REFUSAL";
    case "ERROR":
    case "ACTION_FAILURE":
    case "ACTION_DENIED":
    case "ACTION_TIMEOUT":
      return "ERROR";
    case "ACTION_SUCCESS":
    case "ACTION_CANCELLED":
    case "ACTION_CONFIRMATION":
      return "ACTION_RESULT";
    default:
      return "EXPLICIT_RESULT";
  }
}

function categoryAllowsLlm(category: ResponseCategory): boolean {
  // Always allow try; fallback covers unavailable. Security still fact-bound.
  void category;
  return true;
}

function styleFor(category: ResponseCategory): string[] {
  switch (category) {
    case "CLARIFICATION":
      return ["Ask only the missing variable"];
    case "ACTION_SUCCESS":
      return ["Report success briefly using supplied facts"];
    case "ACTION_FAILURE":
    case "ACTION_DENIED":
      return ["Explain denial/failure without inventing causes"];
    case "SECURITY_ASSESSMENT" as never:
      return [];
    default:
      return [];
  }
}
