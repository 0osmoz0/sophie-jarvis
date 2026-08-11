/**
 * Phase 23 — Voice interface (STT/TTS presentation only).
 */

export type {
  VoiceState,
  VoiceProviderStatus,
  VoiceErrorCode,
  VoiceTranscript,
  VoiceAudioResult,
  VoiceTurnResult,
  VoiceTiming,
  SttCapability,
  TtsCapability,
} from "./types.js";
export { VOICE_LIMITS } from "./types.js";

export type { SpeechToTextProvider, SpeechToTextListenOptions } from "./SpeechToTextProvider.js";
export type { TextToSpeechProvider, TextToSpeechSpeakOptions } from "./TextToSpeechProvider.js";

export { VoicePolicy } from "./VoicePolicy.js";
export { VoiceValidator } from "./VoiceValidator.js";
export { VoiceService } from "./VoiceService.js";
export type { VoiceServiceOptions } from "./VoiceService.js";
export { VoiceAuditLog, confidenceBucket } from "./VoiceAuditLog.js";
export type { VoiceAuditEntry } from "./VoiceAuditLog.js";
export { VoiceMetrics } from "./VoiceMetrics.js";
export type { VoiceMetricsSnapshot } from "./VoiceMetrics.js";
export { createVoiceError, userMessageForVoiceError } from "./VoiceError.js";
export type { VoiceError } from "./VoiceError.js";

export { MockSpeechToTextProvider } from "./MockSpeechToTextProvider.js";
export { MockTextToSpeechProvider } from "./MockTextToSpeechProvider.js";
export { UnavailableSpeechToTextProvider } from "./UnavailableSpeechToTextProvider.js";
export { UnavailableTextToSpeechProvider } from "./UnavailableTextToSpeechProvider.js";
export {
  buildVoiceScenarios,
  summarizeVoiceResults,
} from "./VoiceSimulator.js";
export type { VoiceSimScenario, VoiceSimReport } from "./VoiceSimulator.js";
