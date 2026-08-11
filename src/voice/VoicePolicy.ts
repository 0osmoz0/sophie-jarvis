/**
 * Phase 23 — VoicePolicy (interface constraints only — never authorizes actions).
 */

import { VOICE_LIMITS } from "./types.js";
import type { VoiceTranscript } from "./types.js";

export interface VoicePolicyOptions {
  minConfidence?: number;
  maxTranscriptChars?: number;
  /** Permanent listening is never allowed in Phase 23. */
  allowContinuousListening?: boolean;
}

export class VoicePolicy {
  readonly minConfidence: number;
  readonly maxTranscriptChars: number;
  readonly allowContinuousListening: boolean;

  constructor(options: VoicePolicyOptions = {}) {
    this.minConfidence =
      options.minConfidence ?? VOICE_LIMITS.defaultMinConfidence;
    this.maxTranscriptChars =
      options.maxTranscriptChars ?? VOICE_LIMITS.maxTranscriptChars;
    this.allowContinuousListening = options.allowContinuousListening === true;
  }

  /** Continuous / wake-word listening is out of scope for Phase 23. */
  allowsContinuousListening(): boolean {
    return false;
  }

  evaluateTranscript(transcript: VoiceTranscript): {
    ok: boolean;
    reason?: "empty" | "too_long" | "low_confidence";
  } {
    const text = transcript.text?.trim() ?? "";
    if (!text) return { ok: false, reason: "empty" };
    if (text.length > this.maxTranscriptChars) {
      return { ok: false, reason: "too_long" };
    }
    if (
      transcript.confidence != null &&
      Number.isFinite(transcript.confidence) &&
      transcript.confidence < this.minConfidence
    ) {
      return { ok: false, reason: "low_confidence" };
    }
    return { ok: true };
  }
}
