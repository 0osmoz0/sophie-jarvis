import { ResponseGenerator } from "./ResponseGenerator.js";
import type { ResponseGenerateRequest, ResponseCategory } from "./types.js";

export interface ResponseSimulationReport {
  mode: "SIMULATION";
  total: number;
  category_distribution: Record<string, number>;
  llm_usage_rate: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  policyAvgMs: number;
  validationAvgMs: number;
  formattingAvgMs: number;
  llmAvgMs: number;
  scaleCheckpoints: Record<
    string,
    { avg: number; p50: number; p95: number; max: number }
  >;
}

export class ResponseSimulator {
  private readonly generator: ResponseGenerator;

  constructor(generator?: ResponseGenerator) {
    this.generator = generator ?? new ResponseGenerator({ enableLlm: false });
  }

  async run(count: number): Promise<ResponseSimulationReport> {
    const dist: Record<string, number> = {};
    let llmUsed = 0;
    const totals: number[] = [];
    const policy: number[] = [];
    const validation: number[] = [];
    const formatting: number[] = [];
    const llm: number[] = [];
    const scales = [100, 500, 1000, 5000];
    const scaleCheckpoints: ResponseSimulationReport["scaleCheckpoints"] = {};

    for (let i = 0; i < count; i++) {
      const req = syntheticRequest(i);
      const r = await this.generator.generate(req);
      dist[r.draft.category] = (dist[r.draft.category] ?? 0) + 1;
      if (r.draft.usedLlm) llmUsed += 1;
      totals.push(r.timing.totalMs);
      policy.push(r.timing.policyMs);
      validation.push(r.timing.validationMs);
      formatting.push(r.timing.formattingMs);
      if (r.timing.llmMs != null) llm.push(r.timing.llmMs);

      if (scales.includes(i + 1)) {
        const s = totals.slice().sort((a, b) => a - b);
        scaleCheckpoints[String(i + 1)] = {
          avg: avg(s),
          p50: percentile(s, 50),
          p95: percentile(s, 95),
          max: s[s.length - 1] ?? 0,
        };
      }
    }

    const sorted = totals.slice().sort((a, b) => a - b);
    return {
      mode: "SIMULATION",
      total: count,
      category_distribution: dist,
      llm_usage_rate: count ? llmUsed / count : 0,
      averageMs: avg(sorted),
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      maxMs: sorted[sorted.length - 1] ?? 0,
      policyAvgMs: avg(policy),
      validationAvgMs: avg(validation),
      formattingAvgMs: avg(formatting),
      llmAvgMs: llm.length ? avg(llm) : 0,
      scaleCheckpoints,
    };
  }
}

function syntheticRequest(i: number): ResponseGenerateRequest {
  const cats: ResponseCategory[] = [
    "ACTION_SUCCESS",
    "ACTION_FAILURE",
    "ACTION_DENIED",
    "ACTION_CANCELLED",
    "ACTION_CONFIRMATION",
    "ANSWER",
    "CLARIFICATION",
    "REFUSAL",
    "NO_ACTION",
    "ERROR",
  ];
  const category = cats[i % cats.length]!;
  switch (category) {
    case "ACTION_SUCCESS":
      return {
        category,
        userMessage: "ouvre Safari",
        fallbackText: "Safari est ouvert.",
        facts: [
          {
            key: "action.application",
            value: "Safari",
            source: "ACTION_RESULT",
          },
          { key: "action.type", value: "APP_OPEN", source: "ACTION_RESULT" },
          { key: "action.status", value: "success", source: "ACTION_RESULT" },
        ],
        actionResult: {
          status: "success",
          actionType: "APP_OPEN",
          summary: "Safari est ouvert.",
        },
      };
    case "CLARIFICATION":
      return {
        category,
        userMessage: "ferme-le",
        fallbackText: "Tu veux fermer Safari ou Chrome ?",
        clarificationQuestion: "Tu veux fermer Safari ou Chrome ?",
        facts: [
          {
            key: "missing",
            value: "application",
            source: "CLARIFICATION",
          },
        ],
      };
    case "ANSWER":
      return {
        category,
        userMessage: "qu'est-ce qui est ouvert ?",
        fallbackText: "Tu as actuellement Safari et Cursor ouverts.",
        facts: [
          {
            key: "apps.open",
            value: "Safari, Cursor",
            source: "CONTEXT_RESULT",
          },
        ],
        contextResult: {
          available: true,
          summary: "Tu as actuellement Safari et Cursor ouverts.",
        },
      };
    default:
      return {
        category,
        userMessage: "test",
        fallbackText: "D'accord.",
        facts: [],
      };
  }
}

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}
