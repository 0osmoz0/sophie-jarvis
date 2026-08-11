/**
 * Phase 23 — Speech-to-text provider interface.
 * Produces text only — never executes or authorizes.
 */

import type { SttCapability, VoiceTranscript } from "./types.js";

export interface SpeechToTextListenOptions {
  /** Optional AbortSignal — cancels listening/transcription only. */
  signal?: AbortSignal;
  /** Max listen window (ms). */
  timeoutMs?: number;
  language?: string;
}

export interface SpeechToTextProvider {
  readonly name: string;
  getCapability(): SttCapability;
  /**
   * Explicit listen / push-to-talk style capture.
   * Must not start permanent recording.
   */
  listenOnce(options?: SpeechToTextListenOptions): Promise<VoiceTranscript>;
}
