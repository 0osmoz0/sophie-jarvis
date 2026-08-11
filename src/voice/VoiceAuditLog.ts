/**
 * Phase 23 — Voice audit (metadata only — never audio / full transcript dump).
 */

import { VOICE_LIMITS } from "./types.js";
import type { VoiceErrorCode, VoiceState } from "./types.js";

export interface VoiceAuditEntry {
  timestamp: string;
  voiceRequestId: string;
  requestId: string | null;
  event: string;
  state?: VoiceState | null;
  sttProvider?: string | null;
  ttsProvider?: string | null;
  transcriptChars?: number | null;
  confidenceBucket?: string | null;
  errorCode?: VoiceErrorCode | null;
  latencyMs?: number | null;
  ttsUsed?: boolean | null;
}

export class VoiceAuditLog {
  private readonly entries: VoiceAuditEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = VOICE_LIMITS.maxAuditEntries) {
    this.maxEntries = maxEntries;
  }

  append(entry: VoiceAuditEntry): void {
    this.entries.push({ ...entry });
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  list(): readonly VoiceAuditEntry[] {
    return [...this.entries];
  }

  count(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries.length = 0;
  }
}

export function confidenceBucket(confidence: number | null): string | null {
  if (confidence == null || !Number.isFinite(confidence)) return null;
  if (confidence < 0.4) return "low";
  if (confidence < 0.7) return "mid";
  return "high";
}
