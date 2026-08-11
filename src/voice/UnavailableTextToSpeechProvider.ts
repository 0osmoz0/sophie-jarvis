/**
 * Phase 23 — Unavailable TTS (text fallback expected).
 */

import type { TextToSpeechProvider } from "./TextToSpeechProvider.js";
import type { TtsCapability, VoiceAudioResult } from "./types.js";

export class UnavailableTextToSpeechProvider implements TextToSpeechProvider {
  readonly name = "unavailable-tts";

  getCapability(): TtsCapability {
    return {
      status: "UNAVAILABLE",
      reason: "No local TTS provider configured",
      provider: this.name,
    };
  }

  async speak(_text: string): Promise<VoiceAudioResult> {
    throw Object.assign(new Error("TTS unavailable"), {
      voiceCode: "VOICE_TTS_UNAVAILABLE",
    });
  }
}
