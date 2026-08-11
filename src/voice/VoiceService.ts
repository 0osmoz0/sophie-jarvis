/**
 * Phase 23 — VoiceService
 * Voice is an INTERFACE: STT → text → JarvisRuntime.processInput → TTS.
 * Never imports action executor, permission manager, or confirmation token APIs.
 */

import { randomUUID } from "node:crypto";
import type { JarvisRuntime, ProcessInputResult } from "../runtime/JarvisRuntime.js";
import type { SpeechToTextProvider } from "./SpeechToTextProvider.js";
import type { TextToSpeechProvider } from "./TextToSpeechProvider.js";
import { VoicePolicy } from "./VoicePolicy.js";
import { VoiceValidator } from "./VoiceValidator.js";
import {
  VoiceAuditLog,
  confidenceBucket,
} from "./VoiceAuditLog.js";
import { VoiceMetrics } from "./VoiceMetrics.js";
import {
  createVoiceError,
  userMessageForVoiceError,
} from "./VoiceError.js";
import type {
  VoiceErrorCode,
  VoiceState,
  VoiceTiming,
  VoiceTurnResult,
} from "./types.js";
import { UnavailableSpeechToTextProvider } from "./UnavailableSpeechToTextProvider.js";
import { UnavailableTextToSpeechProvider } from "./UnavailableTextToSpeechProvider.js";

export interface VoiceServiceOptions {
  runtime: JarvisRuntime;
  stt?: SpeechToTextProvider;
  tts?: TextToSpeechProvider;
  policy?: VoicePolicy;
  validator?: VoiceValidator;
  audit?: VoiceAuditLog;
  metrics?: VoiceMetrics;
  now?: () => number;
  /** When false, skip TTS and return text only. */
  enableTts?: boolean;
}

export class VoiceService {
  private readonly runtime: JarvisRuntime;
  private readonly stt: SpeechToTextProvider;
  private readonly tts: TextToSpeechProvider;
  private readonly policy: VoicePolicy;
  private readonly validator: VoiceValidator;
  private readonly audit: VoiceAuditLog;
  private readonly metrics: VoiceMetrics;
  private readonly now: () => number;
  private readonly enableTts: boolean;
  private state: VoiceState = "IDLE";
  private busy = false;

  constructor(options: VoiceServiceOptions) {
    this.runtime = options.runtime;
    this.stt = options.stt ?? new UnavailableSpeechToTextProvider();
    this.tts = options.tts ?? new UnavailableTextToSpeechProvider();
    this.policy = options.policy ?? new VoicePolicy();
    this.validator = options.validator ?? new VoiceValidator();
    this.audit = options.audit ?? new VoiceAuditLog();
    this.metrics = options.metrics ?? new VoiceMetrics();
    this.now = options.now ?? (() => Date.now());
    this.enableTts = options.enableTts !== false;
  }

  getState(): VoiceState {
    return this.state;
  }

  getMetrics(): VoiceMetrics {
    return this.metrics;
  }

  getAudit(): VoiceAuditLog {
    return this.audit;
  }

  getSttCapability() {
    return this.stt.getCapability();
  }

  getTtsCapability() {
    return this.tts.getCapability();
  }

  /** Interrupt presentation TTS only — never cancels an authorized/executed action. */
  interruptSpeech(): void {
    this.tts.stop?.();
    if (this.state === "SPEAKING") {
      this.state = "IDLE";
    }
  }

  /**
   * Push-to-talk / explicit listen turn.
   * STT confidence never authorizes actions.
   */
  async handleListenTurn(options?: {
    signal?: AbortSignal;
  }): Promise<VoiceTurnResult> {
    const voiceRequestId = `vx_${randomUUID()}`;
    const totalStart = this.now();
    const timing: VoiceTiming = {
      listenMs: null,
      sttMs: null,
      processMs: null,
      ttsMs: null,
      totalMs: 0,
    };

    if (this.busy) {
      return this.finishError(
        voiceRequestId,
        timing,
        totalStart,
        "VOICE_BUSY",
      );
    }

    this.busy = true;
    try {
      const sttCap = this.stt.getCapability();
      if (sttCap.status === "PERMISSION_REQUIRED") {
        return this.finishError(
          voiceRequestId,
          timing,
          totalStart,
          "VOICE_PERMISSION_REQUIRED",
        );
      }
      if (sttCap.status === "UNAVAILABLE" || sttCap.status === "CONFIG_REQUIRED") {
        return this.finishError(
          voiceRequestId,
          timing,
          totalStart,
          "VOICE_STT_UNAVAILABLE",
        );
      }

      this.state = "LISTENING";
      const listenStart = this.now();
      this.state = "TRANSCRIBING";
      let transcript;
      try {
        transcript = this.validator.normalizeTranscript(
          await this.stt.listenOnce({ signal: options?.signal }),
        );
      } catch (err) {
        const code = extractVoiceCode(err) ?? "VOICE_STT_FAILED";
        timing.sttMs = this.now() - listenStart;
        this.metrics.record({ sttFail: true });
        return this.finishError(voiceRequestId, timing, totalStart, code);
      }
      timing.listenMs = this.now() - listenStart;
      timing.sttMs = timing.listenMs;

      this.audit.append({
        timestamp: new Date(this.now()).toISOString(),
        voiceRequestId,
        requestId: null,
        event: "stt_complete",
        state: "TRANSCRIBING",
        sttProvider: transcript.provider,
        transcriptChars: transcript.text.length,
        confidenceBucket: confidenceBucket(transcript.confidence),
        latencyMs: timing.sttMs,
      });

      const evalT = this.policy.evaluateTranscript(transcript);
      if (!evalT.ok) {
        if (evalT.reason === "empty") {
          this.metrics.record({ sttEmpty: true });
          return this.finishError(
            voiceRequestId,
            timing,
            totalStart,
            "VOICE_STT_EMPTY",
            transcript,
          );
        }
        if (evalT.reason === "low_confidence") {
          this.metrics.record({ sttLowConfidence: true });
          // Never processInput / never execute on low confidence
          return this.finishClarification(
            voiceRequestId,
            timing,
            totalStart,
            transcript,
            "VOICE_STT_LOW_CONFIDENCE",
          );
        }
        this.metrics.record({ sttFail: true });
        return this.finishError(
          voiceRequestId,
          timing,
          totalStart,
          "VOICE_STT_FAILED",
          transcript,
        );
      }

      this.metrics.record({ sttOk: true });
      return this.processTranscript(voiceRequestId, transcript, timing, totalStart);
    } finally {
      this.busy = false;
      if (this.state !== "SPEAKING") {
        this.state = "IDLE";
      }
    }
  }

  /**
   * Inject already-known text as if STT produced it (tests / typed push-to-talk).
   * Still goes through VoicePolicy then JarvisRuntime — never bypasses Phase 8.
   */
  async handleTextAsVoice(
    text: string,
    extras?: { confidence?: number | null },
  ): Promise<VoiceTurnResult> {
    const voiceRequestId = `vx_${randomUUID()}`;
    const totalStart = this.now();
    const timing: VoiceTiming = {
      listenMs: 0,
      sttMs: 0,
      processMs: null,
      ttsMs: null,
      totalMs: 0,
    };
    if (this.busy) {
      return this.finishError(voiceRequestId, timing, totalStart, "VOICE_BUSY");
    }
    this.busy = true;
    try {
      const transcript = this.validator.normalizeTranscript({
        text,
        confidence: extras?.confidence ?? 0.95,
        language: "fr",
        durationMs: 0,
        provider: "text-inject",
      });
      const evalT = this.policy.evaluateTranscript(transcript);
      if (!evalT.ok) {
        if (evalT.reason === "low_confidence") {
          this.metrics.record({ sttLowConfidence: true });
          return this.finishClarification(
            voiceRequestId,
            timing,
            totalStart,
            transcript,
            "VOICE_STT_LOW_CONFIDENCE",
          );
        }
        if (evalT.reason === "empty") {
          this.metrics.record({ sttEmpty: true });
          return this.finishError(
            voiceRequestId,
            timing,
            totalStart,
            "VOICE_STT_EMPTY",
            transcript,
          );
        }
      }
      this.metrics.record({ sttOk: true });
      return this.processTranscript(voiceRequestId, transcript, timing, totalStart);
    } finally {
      this.busy = false;
      if (this.state !== "SPEAKING") this.state = "IDLE";
    }
  }

  private async processTranscript(
    voiceRequestId: string,
    transcript: import("./types.js").VoiceTranscript,
    timing: VoiceTiming,
    totalStart: number,
  ): Promise<VoiceTurnResult> {
    this.state = "PROCESSING";
    const p0 = this.now();
    let processed: ProcessInputResult;
    try {
      processed = await this.runtime.processInput(transcript.text);
    } catch {
      timing.processMs = this.now() - p0;
      this.metrics.record({ processError: true });
      return this.finishError(
        voiceRequestId,
        timing,
        totalStart,
        "VOICE_INTERNAL_ERROR",
        transcript,
      );
    }
    timing.processMs = this.now() - p0;
    this.metrics.record({
      processOk: processed.response.type !== "error",
      processError: processed.response.type === "error",
    });

    const responseText = extractResponseText(processed);
    let ttsUsed = false;
    let ttsFallbackToText = false;
    let ttsResult = null as VoiceTurnResult["tts"];

    if (this.enableTts && responseText) {
      const ttsCap = this.tts.getCapability();
      if (ttsCap.status === "AVAILABLE") {
        this.state = "SPEAKING";
        const t0 = this.now();
        try {
          ttsResult = await this.tts.speak(responseText);
          // Drop ephemeral buffer from returned result for safety in callers that serialize
          if (ttsResult._ephemeralBuffer) {
            const { _ephemeralBuffer: _, ...safe } = ttsResult;
            ttsResult = safe;
          }
          timing.ttsMs = this.now() - t0;
          ttsUsed = true;
          this.metrics.record({ ttsOk: true });
        } catch {
          timing.ttsMs = this.now() - t0;
          ttsFallbackToText = true;
          this.metrics.record({ ttsFail: true, ttsFallback: true });
        }
      } else {
        ttsFallbackToText = true;
        this.metrics.record({ ttsFallback: true });
      }
    } else if (responseText) {
      ttsFallbackToText = true;
    }

    timing.totalMs = this.now() - totalStart;
    this.state = "IDLE";

    this.audit.append({
      timestamp: new Date(this.now()).toISOString(),
      voiceRequestId,
      requestId: processed.interactionId,
      event: "voice_turn_complete",
      state: "IDLE",
      sttProvider: transcript.provider,
      ttsProvider: ttsResult?.provider ?? this.tts.name,
      transcriptChars: transcript.text.length,
      confidenceBucket: confidenceBucket(transcript.confidence),
      latencyMs: timing.totalMs,
      ttsUsed,
    });

    return {
      voiceRequestId,
      requestId: processed.interactionId,
      state: "IDLE",
      transcript,
      responseText,
      tts: ttsResult,
      ttsUsed,
      ttsFallbackToText,
      errorCode: null,
      timing,
    };
  }

  private finishClarification(
    voiceRequestId: string,
    timing: VoiceTiming,
    totalStart: number,
    transcript: import("./types.js").VoiceTranscript,
    code: VoiceErrorCode,
  ): VoiceTurnResult {
    timing.totalMs = this.now() - totalStart;
    this.state = "IDLE";
    const message = userMessageForVoiceError(code);
    this.audit.append({
      timestamp: new Date(this.now()).toISOString(),
      voiceRequestId,
      requestId: null,
      event: "voice_low_confidence",
      errorCode: code,
      transcriptChars: transcript.text.length,
      confidenceBucket: confidenceBucket(transcript.confidence),
      latencyMs: timing.totalMs,
    });
    return {
      voiceRequestId,
      requestId: null,
      state: "IDLE",
      transcript,
      responseText: message,
      tts: null,
      ttsUsed: false,
      ttsFallbackToText: true,
      errorCode: code,
      timing,
    };
  }

  private finishError(
    voiceRequestId: string,
    timing: VoiceTiming,
    totalStart: number,
    code: VoiceErrorCode,
    transcript: import("./types.js").VoiceTranscript | null = null,
  ): VoiceTurnResult {
    timing.totalMs = this.now() - totalStart;
    this.state = "ERROR";
    const err = createVoiceError(code, userMessageForVoiceError(code));
    this.audit.append({
      timestamp: new Date(this.now()).toISOString(),
      voiceRequestId,
      requestId: null,
      event: "voice_error",
      state: "ERROR",
      errorCode: code,
      transcriptChars: transcript?.text.length ?? null,
      latencyMs: timing.totalMs,
    });
    this.state = "IDLE";
    return {
      voiceRequestId,
      requestId: null,
      state: "IDLE",
      transcript,
      responseText: err.message,
      tts: null,
      ttsUsed: false,
      ttsFallbackToText: true,
      errorCode: code,
      timing,
    };
  }
}

function extractResponseText(processed: ProcessInputResult): string | null {
  const r = processed.response;
  if ("message" in r && typeof r.message === "string") return r.message;
  return null;
}

function extractVoiceCode(err: unknown): VoiceErrorCode | null {
  if (err && typeof err === "object" && "voiceCode" in err) {
    return (err as { voiceCode: VoiceErrorCode }).voiceCode;
  }
  return null;
}
