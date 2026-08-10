/**
 * AIProvider — interface only.
 *
 * The future LLM may only PROPOSE an Intent.
 * It must never execute tools or shell commands.
 *
 * Pipeline (mandatory):
 *   LLM → Intent → JarvisCore → PermissionManager → Tool → Result
 */

export interface AIGenerateRequest {
  prompt: string;
  context?: Record<string, unknown>;
}

export interface AIAnalyzeRequest {
  input: unknown;
  question?: string;
}

export interface AIClassifyRequest {
  input: unknown;
  labels: string[];
}

export interface AIGenerateResult {
  text: string;
  /** Optional proposed intent — never executed by the provider itself. */
  proposedIntent?: { tool: string; arguments?: Record<string, unknown> };
}

export interface AIAnalyzeResult {
  summary: string;
  details?: Record<string, unknown>;
}

export interface AIClassifyResult {
  label: string;
  confidence: number;
}

export interface AIProvider {
  generate(request: AIGenerateRequest): Promise<AIGenerateResult>;
  analyze(request: AIAnalyzeRequest): Promise<AIAnalyzeResult>;
  classify(request: AIClassifyRequest): Promise<AIClassifyResult>;
}
