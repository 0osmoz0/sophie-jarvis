import type {
  AIAnalyzeRequest,
  AIAnalyzeResult,
  AIClassifyRequest,
  AIClassifyResult,
  AIGenerateRequest,
  AIGenerateResult,
  AIProvider,
} from "./AIProvider.js";

/**
 * MockAIProvider — offline stub for tests.
 * Does NOT call external services.
 * Does NOT execute tools — it may only propose an Intent structure.
 */
export class MockAIProvider implements AIProvider {
  async generate(request: AIGenerateRequest): Promise<AIGenerateResult> {
    const prompt = request.prompt.toLowerCase();

    // Harmless demo: propose system.info when the prompt mentions "system" / "info".
    if (prompt.includes("system") || prompt.includes("info")) {
      return {
        text: "Proposed intent: system.info (not executed by MockAIProvider).",
        proposedIntent: { tool: "system.info", arguments: {} },
      };
    }

    return {
      text: `Mock response for: ${request.prompt}`,
    };
  }

  async analyze(request: AIAnalyzeRequest): Promise<AIAnalyzeResult> {
    return {
      summary: "Mock analysis (no external model).",
      details: {
        inputType: typeof request.input,
        question: request.question ?? null,
      },
    };
  }

  async classify(request: AIClassifyRequest): Promise<AIClassifyResult> {
    const label = request.labels[0] ?? "unknown";
    return {
      label,
      confidence: 0.5,
    };
  }
}
