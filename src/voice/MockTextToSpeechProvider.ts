/**
 * Phase 23 — Mock TTS (presentation metadata only, no OS speech).
 */

import type { TextToSpeechProvider } from "./TextToSpeechProvider.js";
import type { TtsCapability, VoiceAudioResult } from "./types.js";

export interface MockTextToSpeechOptions {
  unavailable?: boolean;
  failOnce?: boolean;
  latencyMs?: number;
}

export class MockTextToSpeechProvider implements TextToSpeechProvider {
  readonly name = "mock-tts";
  private unavailable: boolean;
  private failOnce: boolean;
  private readonly latencyMs: number;
  private stopped = false;

  constructor(options: MockTextToSpeechOptions = {}) {
    this.unavailable = options.unavailable === true;
    this.failOnce = options.failOnce === true;
    this.latencyMs = options.latencyMs ?? 0;
  }

  setUnavailable(v: boolean): void {
    this.unavailable = v;
  }

  getCapability(): TtsCapability {
    if (this.unavailable) {
      return {
        status: "UNAVAILABLE",
        reason: "Mock TTS unavailable",
        provider: this.name,
      };
    }
    return { status: "AVAILABLE", provider: this.name };
  }

  stop(): void {
    this.stopped = true;
  }

  async speak(text: string): Promise<VoiceAudioResult> {
    this.stopped = false;
    if (this.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.latencyMs));
    }
    if (this.stopped) {
      throw Object.assign(new Error("TTS interrupted"), {
        voiceCode: "VOICE_INTERRUPTED",
      });
    }
    if (this.unavailable) {
      throw Object.assign(new Error("TTS_UNAVAILABLE"), {
        voiceCode: "VOICE_TTS_UNAVAILABLE",
      });
    }
    if (this.failOnce) {
      this.failOnce = false;
      throw Object.assign(new Error("TTS_FAILED"), {
        voiceCode: "VOICE_TTS_FAILED",
      });
    }
    const cleaned = text.trim();
    // Estimate duration; do not persist audio. Tiny ephemeral silence buffer.
    const durationMs = Math.min(8_000, Math.max(200, cleaned.length * 45));
    const buf = new Uint8Array(0);
    return {
      mimeType: "audio/x-jarvis-mock",
      byteLength: buf.byteLength,
      durationMs,
      provider: this.name,
      _ephemeralBuffer: buf,
    };
  }
}
