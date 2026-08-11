/**
 * MemoryPolicy — decide STORE / REJECT / TEMPORARY / FORGET.
 * Never stores secrets. Never executes.
 */
import type {
  MemoryCandidate,
  MemoryKind,
  MemoryPolicyDecision,
} from "./types.js";

export interface MemoryPolicyResult {
  decision: MemoryPolicyDecision;
  reason: string;
  kind?: MemoryKind;
  confidence?: number;
  expiresInMs?: number;
}

const TEMP_MS = 2 * 60 * 60 * 1000; // 2h
const LOW_CONF_MS = 24 * 60 * 60 * 1000; // 24h

export class MemoryPolicy {
  decide(candidate: MemoryCandidate): MemoryPolicyResult {
    const content = (candidate.content ?? "").trim();
    if (!content) {
      return { decision: "REJECT", reason: "empty_content" };
    }

    // Transient activity phrases
    if (
      /^(je )?(suis en train de|viens de|vais) (manger|dormir|partir|revenir)/i.test(
        content,
      ) ||
      /\b(en ce moment|right now|currently eating)\b/i.test(content)
    ) {
      return {
        decision: "TEMPORARY",
        reason: "transient_activity",
        kind: "temporary",
        confidence: Math.min(candidate.confidence ?? 0.5, 0.5),
        expiresInMs: TEMP_MS,
      };
    }

    // Meta instructions are not memories
    if (
      /ignore (tout|all|previous|précédent)|oublie (les|tes) (règles|instructions)|system prompt/i.test(
        content,
      )
    ) {
      return { decision: "REJECT", reason: "meta_instruction" };
    }

    const conf = candidate.confidence ?? 0.7;
    if (conf < 0.4) {
      return {
        decision: "TEMPORARY",
        reason: "low_confidence",
        kind: candidate.kind === "temporary" ? "temporary" : candidate.kind,
        confidence: conf,
        expiresInMs: LOW_CONF_MS,
      };
    }

    // Hedging language → lower persistence unless explicit
    if (
      candidate.source !== "user_explicit" &&
      /\b(peut[- ]être|maybe|might|probably|je pense|i think|possibly)\b/i.test(
        content,
      )
    ) {
      return {
        decision: "TEMPORARY",
        reason: "uncertain_language",
        kind: candidate.kind,
        confidence: Math.min(conf, 0.45),
        expiresInMs: LOW_CONF_MS,
      };
    }

    if (candidate.kind === "temporary") {
      return {
        decision: "TEMPORARY",
        reason: "kind_temporary",
        kind: "temporary",
        confidence: conf,
        expiresInMs: candidate.expiresAt
          ? Math.max(0, candidate.expiresAt - Date.now())
          : TEMP_MS,
      };
    }

    return {
      decision: "STORE",
      reason: "accepted",
      kind: candidate.kind,
      confidence: conf,
    };
  }
}
