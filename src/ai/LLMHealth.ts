import { OllamaLLMProvider } from "./OllamaLLMProvider.js";
import type { LLMProviderStatus } from "./types.js";

export interface LLMHealthReport {
  provider: string;
  status: LLMProviderStatus;
  model: string | null;
  endpoint: string | null;
  latencyMs: number | null;
  responseChars: number | null;
  error: string | null;
}

/**
 * Probe configured local LLM health — never invents metrics.
 */
export async function probeLLMHealth(
  options?: ConstructorParameters<typeof OllamaLLMProvider>[0],
): Promise<LLMHealthReport> {
  const provider = new OllamaLLMProvider(options);
  const started = Date.now();
  const result = await provider.understand({
    text: 'Reply with JSON only: {"type":"no_action","payload":{"reason":"health"}}',
  });
  const latencyMs = Date.now() - started;

  if (!result.ok) {
    return {
      provider: provider.name,
      status: result.status,
      model: provider.getModel(),
      endpoint: provider.getEndpoint(),
      latencyMs: result.status === "TIMEOUT" ? latencyMs : latencyMs,
      responseChars: result.raw?.length ?? null,
      error: result.error,
    };
  }

  return {
    provider: provider.name,
    status: "AVAILABLE",
    model: provider.getModel(),
    endpoint: provider.getEndpoint(),
    latencyMs,
    responseChars: result.raw.length,
    error: null,
  };
}

export function formatLLMHealth(report: LLMHealthReport): string {
  const lines = [
    report.provider === "ollama" ? "Ollama" : report.provider,
    `Status: ${report.status}`,
  ];
  if (report.model) lines.push(`Model: ${report.model}`);
  if (report.endpoint) lines.push(`Endpoint: ${report.endpoint}`);
  if (report.latencyMs !== null) {
    lines.push(`Latency: ${(report.latencyMs / 1000).toFixed(2)}s`);
  }
  if (report.responseChars !== null) {
    lines.push(`ResponseChars: ${report.responseChars}`);
  }
  if (report.error) lines.push(`Error: ${report.error}`);
  return lines.join("\n");
}
