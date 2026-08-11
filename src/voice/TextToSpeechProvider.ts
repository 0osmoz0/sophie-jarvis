/**
 * Phase 23 — Text-to-speech provider interface.
 * Presentation only — never mutates decisions or executions.
 */

import type { TtsCapability, VoiceAudioResult } from "./types.js";

export interface TextToSpeechSpeakOptions {
  signal?: AbortSignal;
  language?: string;
}

export interface TextToSpeechProvider {
  readonly name: string;
  getCapability(): TtsCapability;
  speak(
    text: string,
    options?: TextToSpeechSpeakOptions,
  ): Promise<VoiceAudioResult>;
  /** Best-effort stop of current speech (presentation only). */
  stop?(): void;
}
