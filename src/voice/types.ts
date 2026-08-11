/**
 * Phase 23 — Voice types (interface only — no authority).
 */

export type VoiceState =
  | "IDLE"
  | "LISTENING"
  | "TRANSCRIBING"
  | "PROCESSING"
  | "SPEAKING"
  | "ERROR";

export type VoiceProviderStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "PERMISSION_REQUIRED"
  | "CONFIG_REQUIRED"
  | "ERROR";

export type VoiceErrorCode =
  | "VOICE_MICROPHONE_UNAVAILABLE"
  | "VOICE_PERMISSION_REQUIRED"
  | "VOICE_STT_UNAVAILABLE"
  | "VOICE_STT_TIMEOUT"
  | "VOICE_STT_FAILED"
  | "VOICE_STT_EMPTY"
  | "VOICE_STT_LOW_CONFIDENCE"
  | "VOICE_TTS_UNAVAILABLE"
  | "VOICE_TTS_FAILED"
  | "VOICE_INTERRUPTED"
  | "VOICE_CANCELLED"
  | "VOICE_BUSY"
  | "VOICE_INTERNAL_ERROR";

export interface VoiceTranscript {
  text: string;
  confidence: number | null;
  language: string | null;
  durationMs: number | null;
  provider: string;
}

export interface VoiceAudioResult {
  /** Presentation only — never stored in audit by default. */
  mimeType: string;
  /** Length metadata only when buffer present; buffers must not be logged. */
  byteLength: number;
  durationMs: number | null;
  provider: string;
  /** In-memory only for playback; VoiceAudit must never persist this. */
  _ephemeralBuffer?: Uint8Array;
}

export interface VoiceTurnResult {
  voiceRequestId: string;
  requestId: string | null;
  state: VoiceState;
  transcript: VoiceTranscript | null;
  responseText: string | null;
  tts: VoiceAudioResult | null;
  ttsUsed: boolean;
  ttsFallbackToText: boolean;
  errorCode: VoiceErrorCode | null;
  timing: VoiceTiming;
}

export interface VoiceTiming {
  listenMs: number | null;
  sttMs: number | null;
  processMs: number | null;
  ttsMs: number | null;
  totalMs: number;
}

export interface SttCapability {
  status: VoiceProviderStatus;
  reason?: string;
  provider: string;
}

export interface TtsCapability {
  status: VoiceProviderStatus;
  reason?: string;
  provider: string;
}

export const VOICE_LIMITS = {
  maxTranscriptChars: 2_000,
  defaultMinConfidence: 0.55,
  maxAuditEntries: 500,
  maxMetricsSamples: 256,
} as const;
