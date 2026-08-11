/**
 * Phase 20 — pipeline orchestration context (no extra authority).
 * Carries results between stages. Never LLM→Executor shortcuts.
 */

import type { IntentRouterOutcome } from "../ai/types.js";
import type { Decision } from "../decision/types.js";
import type { ActionPlan } from "../actions/types.js";
import type { ResponseDraft } from "../response/types.js";
import type { ConversationUnderstandBundle } from "../conversation/types.js";

export type LatencyClass = "FAST" | "NORMAL" | "SLOW" | "VERY_SLOW";

export interface PipelineTiming {
  conversationMs: number | null;
  referenceResolutionMs: number | null;
  memoryRecallMs: number | null;

  llmUnderstandMs: number | null;
  validationMs: number | null;

  decisionMs: number | null;
  planningMs: number | null;
  permissionMs: number | null;
  confirmationMs: number | null;
  executionMs: number | null;

  contextMs: number | null;

  llmResponseMs: number | null;
  responseValidationMs: number | null;

  totalMs: number;

  /** Diagnostic counters (not authority). */
  llmUnderstandCalls: number;
  llmResponseCalls: number;
  memoryRecallUsed: boolean;
  memoryRecallSkipped: boolean;
}

export function emptyPipelineTiming(): PipelineTiming {
  return {
    conversationMs: null,
    referenceResolutionMs: null,
    memoryRecallMs: null,
    llmUnderstandMs: null,
    validationMs: null,
    decisionMs: null,
    planningMs: null,
    permissionMs: null,
    confirmationMs: null,
    executionMs: null,
    contextMs: null,
    llmResponseMs: null,
    responseValidationMs: null,
    totalMs: 0,
    llmUnderstandCalls: 0,
    llmResponseCalls: 0,
    memoryRecallUsed: false,
    memoryRecallSkipped: false,
  };
}

export function classifyLatency(totalMs: number): LatencyClass {
  if (totalMs < 100) return "FAST";
  if (totalMs < 500) return "NORMAL";
  if (totalMs < 1500) return "SLOW";
  return "VERY_SLOW";
}

/**
 * Per-request orchestration bag. Informational only — never grants permission.
 */
export interface RequestPipelineContext {
  requestId: string;
  userText: string;
  effectiveText?: string;

  conversationBundle?: ConversationUnderstandBundle;

  understandOutcome?: IntentRouterOutcome;
  validatedIntentKind?: string | null;

  decision?: Decision | null;

  actionPlan?: ActionPlan | null;
  permissionResult?: { allowed: boolean; code?: string } | null;
  confirmationState?: string | null;
  executionResult?: { ok: boolean; code?: string | null } | null;

  contextResultSummary?: string | null;
  memoryUsed?: boolean;

  responseDraft?: ResponseDraft | null;

  timing: PipelineTiming;
  latencyClass?: LatencyClass;
}

export function formatPipelineTiming(timing: PipelineTiming): string {
  const lines = ["=== JARVIS PIPELINE TIMING ===", ""];
  const row = (label: string, ms: number | null | undefined) => {
    if (ms == null) return;
    lines.push(`${label.padEnd(18)} ${ms.toFixed(1)} ms`);
  };
  row("conversation", timing.conversationMs);
  row("reference", timing.referenceResolutionMs);
  row("memory", timing.memoryRecallMs);
  row("understand", timing.llmUnderstandMs);
  row("validation", timing.validationMs);
  row("decision", timing.decisionMs);
  row("planning", timing.planningMs);
  row("permission", timing.permissionMs);
  row("confirmation", timing.confirmationMs);
  row("execution", timing.executionMs);
  row("context", timing.contextMs);
  row("response", timing.llmResponseMs);
  row("resp.valid", timing.responseValidationMs);
  lines.push("--------------------------------");
  lines.push(`${"TOTAL".padEnd(18)} ${timing.totalMs.toFixed(1)} ms`);
  lines.push("");
  lines.push(`latency class: ${classifyLatency(timing.totalMs)}`);
  lines.push(`understand calls: ${timing.llmUnderstandCalls}`);
  lines.push(`response calls: ${timing.llmResponseCalls}`);
  lines.push(
    `memory recall: ${timing.memoryRecallUsed ? "used" : timing.memoryRecallSkipped ? "skipped" : "n/a"}`,
  );
  return lines.join("\n");
}
