/**
 * Phase 23 — synthetic voice traffic simulator (MODE: SIMULATION).
 */

import type { VoiceTurnResult } from "./types.js";

export type VoiceSimScenario =
  | "normal"
  | "empty"
  | "noisy"
  | "low_confidence"
  | "stt_timeout"
  | "stt_unavailable"
  | "tts_unavailable"
  | "tts_failure"
  | "confirm_yes"
  | "confirm_no"
  | "stale_oui"
  | "ambiguous"
  | "injection";

export interface VoiceSimReport {
  mode: "SIMULATION";
  total: number;
  distribution: Record<string, number>;
  errorCodes: Record<string, number>;
  ttsFallbackRate: number;
  processErrorRate: number;
}

export function buildVoiceScenarios(n: number): VoiceSimScenario[] {
  const cycle: VoiceSimScenario[] = [
    "normal",
    "empty",
    "noisy",
    "low_confidence",
    "stt_timeout",
    "stt_unavailable",
    "tts_unavailable",
    "tts_failure",
    "confirm_yes",
    "confirm_no",
    "stale_oui",
    "ambiguous",
    "injection",
  ];
  const out: VoiceSimScenario[] = [];
  for (let i = 0; i < n; i++) out.push(cycle[i % cycle.length]!);
  return out;
}

export function summarizeVoiceResults(
  results: VoiceTurnResult[],
): VoiceSimReport {
  const distribution: Record<string, number> = {};
  const errorCodes: Record<string, number> = {};
  let ttsFallback = 0;
  let processErrors = 0;
  for (const r of results) {
    const key = r.errorCode ?? (r.ttsUsed ? "ok_tts" : "ok_text");
    distribution[key] = (distribution[key] ?? 0) + 1;
    if (r.errorCode) {
      errorCodes[r.errorCode] = (errorCodes[r.errorCode] ?? 0) + 1;
    }
    if (r.ttsFallbackToText) ttsFallback += 1;
    if (r.errorCode === "VOICE_INTERNAL_ERROR") processErrors += 1;
  }
  return {
    mode: "SIMULATION",
    total: results.length,
    distribution,
    errorCodes,
    ttsFallbackRate: results.length ? ttsFallback / results.length : 0,
    processErrorRate: results.length ? processErrors / results.length : 0,
  };
}
