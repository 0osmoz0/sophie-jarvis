/**
 * Phase 23 — Unavailable STT (honest failure, no mic access).
 */

import type { SpeechToTextProvider } from "./SpeechToTextProvider.js";
import type { SttCapability, VoiceTranscript } from "./types.js";

export class UnavailableSpeechToTextProvider implements SpeechToTextProvider {
  readonly name = "unavailable-stt";
  private readonly reason: string;
  private readonly permissionRequired: boolean;

  constructor(options?: { permissionRequired?: boolean; reason?: string }) {
    this.permissionRequired = options?.permissionRequired === true;
    this.reason =
      options?.reason ??
      (this.permissionRequired
        ? "Microphone permission required"
        : "No local STT provider configured");
  }

  getCapability(): SttCapability {
    return {
      status: this.permissionRequired
        ? "PERMISSION_REQUIRED"
        : "UNAVAILABLE",
      reason: this.reason,
      provider: this.name,
    };
  }

  async listenOnce(): Promise<VoiceTranscript> {
    throw Object.assign(new Error(this.reason), {
      voiceCode: this.permissionRequired
        ? "VOICE_PERMISSION_REQUIRED"
        : "VOICE_STT_UNAVAILABLE",
    });
  }
}
