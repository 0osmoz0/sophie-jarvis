/**
 * Phase 23 — bounded voice metrics (metadata only).
 */

export interface VoiceMetricsSnapshot {
  voiceRequests: number;
  sttSuccesses: number;
  sttFailures: number;
  sttEmpty: number;
  sttLowConfidence: number;
  ttsSuccesses: number;
  ttsFallbacks: number;
  ttsFailures: number;
  processSuccesses: number;
  processErrors: number;
}

export class VoiceMetrics {
  private data: VoiceMetricsSnapshot = empty();

  record(event: {
    sttOk?: boolean;
    sttEmpty?: boolean;
    sttLowConfidence?: boolean;
    sttFail?: boolean;
    ttsOk?: boolean;
    ttsFallback?: boolean;
    ttsFail?: boolean;
    processOk?: boolean;
    processError?: boolean;
  }): void {
    this.data.voiceRequests += 1;
    if (event.sttOk) this.data.sttSuccesses += 1;
    if (event.sttFail) this.data.sttFailures += 1;
    if (event.sttEmpty) this.data.sttEmpty += 1;
    if (event.sttLowConfidence) this.data.sttLowConfidence += 1;
    if (event.ttsOk) this.data.ttsSuccesses += 1;
    if (event.ttsFallback) this.data.ttsFallbacks += 1;
    if (event.ttsFail) this.data.ttsFailures += 1;
    if (event.processOk) this.data.processSuccesses += 1;
    if (event.processError) this.data.processErrors += 1;
  }

  getSnapshot(): VoiceMetricsSnapshot {
    return { ...this.data };
  }

  format(): string {
    const s = this.data;
    return [
      "=== JARVIS VOICE METRICS ===",
      `voiceRequests: ${s.voiceRequests}`,
      `sttSuccesses: ${s.sttSuccesses}`,
      `sttFailures: ${s.sttFailures}`,
      `sttEmpty: ${s.sttEmpty}`,
      `sttLowConfidence: ${s.sttLowConfidence}`,
      `ttsSuccesses: ${s.ttsSuccesses}`,
      `ttsFallbacks: ${s.ttsFallbacks}`,
      `ttsFailures: ${s.ttsFailures}`,
      `processSuccesses: ${s.processSuccesses}`,
      `processErrors: ${s.processErrors}`,
    ].join("\n");
  }

  reset(): void {
    this.data = empty();
  }
}

function empty(): VoiceMetricsSnapshot {
  return {
    voiceRequests: 0,
    sttSuccesses: 0,
    sttFailures: 0,
    sttEmpty: 0,
    sttLowConfidence: 0,
    ttsSuccesses: 0,
    ttsFallbacks: 0,
    ttsFailures: 0,
    processSuccesses: 0,
    processErrors: 0,
  };
}
