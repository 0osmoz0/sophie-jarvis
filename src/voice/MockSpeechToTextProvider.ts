/**
 * Phase 23 — Mock STT for tests / push-to-talk simulation.
 * Never accesses a real microphone.
 */

import type { SpeechToTextProvider } from "./SpeechToTextProvider.js";
import type { SttCapability, VoiceTranscript } from "./types.js";

export interface MockSpeechToTextOptions {
  /** Scripted transcripts returned in order. */
  queue?: Array<Partial<VoiceTranscript> & { text: string }>;
  defaultConfidence?: number;
  /** Simulate permission denied. */
  permissionRequired?: boolean;
  unavailable?: boolean;
  failOnce?: boolean;
  timeoutOnce?: boolean;
  latencyMs?: number;
}

export class MockSpeechToTextProvider implements SpeechToTextProvider {
  readonly name = "mock-stt";
  private queue: Array<Partial<VoiceTranscript> & { text: string }>;
  private readonly defaultConfidence: number;
  private permissionRequired: boolean;
  private unavailable: boolean;
  private failOnce: boolean;
  private timeoutOnce: boolean;
  private readonly latencyMs: number;

  constructor(options: MockSpeechToTextOptions = {}) {
    this.queue = [...(options.queue ?? [])];
    this.defaultConfidence = options.defaultConfidence ?? 0.92;
    this.permissionRequired = options.permissionRequired === true;
    this.unavailable = options.unavailable === true;
    this.failOnce = options.failOnce === true;
    this.timeoutOnce = options.timeoutOnce === true;
    this.latencyMs = options.latencyMs ?? 0;
  }

  enqueue(text: string, extras?: Partial<VoiceTranscript>): void {
    this.queue.push({ text, ...extras });
  }

  setPermissionRequired(v: boolean): void {
    this.permissionRequired = v;
  }

  setUnavailable(v: boolean): void {
    this.unavailable = v;
  }

  getCapability(): SttCapability {
    if (this.permissionRequired) {
      return {
        status: "PERMISSION_REQUIRED",
        reason: "Microphone permission not granted (mock)",
        provider: this.name,
      };
    }
    if (this.unavailable) {
      return {
        status: "UNAVAILABLE",
        reason: "Mock STT unavailable",
        provider: this.name,
      };
    }
    return { status: "AVAILABLE", provider: this.name };
  }

  async listenOnce(): Promise<VoiceTranscript> {
    if (this.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.latencyMs));
    }
    if (this.permissionRequired) {
      throw Object.assign(new Error("PERMISSION_REQUIRED"), {
        voiceCode: "VOICE_PERMISSION_REQUIRED",
      });
    }
    if (this.unavailable) {
      throw Object.assign(new Error("STT_UNAVAILABLE"), {
        voiceCode: "VOICE_STT_UNAVAILABLE",
      });
    }
    if (this.timeoutOnce) {
      this.timeoutOnce = false;
      throw Object.assign(new Error("STT_TIMEOUT"), {
        voiceCode: "VOICE_STT_TIMEOUT",
      });
    }
    if (this.failOnce) {
      this.failOnce = false;
      throw Object.assign(new Error("STT_FAILED"), {
        voiceCode: "VOICE_STT_FAILED",
      });
    }
    const next = this.queue.shift();
    if (!next) {
      return {
        text: "",
        confidence: null,
        language: "fr",
        durationMs: 0,
        provider: this.name,
      };
    }
    return {
      text: next.text,
      confidence: next.confidence ?? this.defaultConfidence,
      language: next.language ?? "fr",
      durationMs: next.durationMs ?? 120,
      provider: this.name,
    };
  }
}
