/**
 * Phase 23 — VoiceValidator (transcript hygiene only).
 */

import type { VoiceTranscript } from "./types.js";
import { VOICE_LIMITS } from "./types.js";

export class VoiceValidator {
  normalizeTranscript(raw: VoiceTranscript): VoiceTranscript {
    const text = (raw.text ?? "")
      .replace(/\u0000/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, VOICE_LIMITS.maxTranscriptChars);
    return {
      text,
      confidence:
        raw.confidence == null || !Number.isFinite(raw.confidence)
          ? null
          : Math.max(0, Math.min(1, raw.confidence)),
      language: raw.language ?? null,
      durationMs:
        raw.durationMs == null || !Number.isFinite(raw.durationMs)
          ? null
          : Math.max(0, raw.durationMs),
      provider: raw.provider || "unknown",
    };
  }
}
