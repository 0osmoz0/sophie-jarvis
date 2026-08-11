/**
 * Phase 21 — ObservabilityPolicy (passive; never authorizes).
 */

import { OBSERVABILITY_LIMITS } from "./types.js";

const FORBIDDEN_KEYS =
  /password|api[_-]?key|token|secret|clipboard|keystroke|screenshot|memory\.content|message\.content|file.?content|window.?text|prompt|full.?response/i;

export class ObservabilityPolicy {
  /** Strip or reject fields that must never appear in traces. */
  allowDetail(key: string, value: string | null | undefined): string | null {
    if (!value) return null;
    if (FORBIDDEN_KEYS.test(key) || FORBIDDEN_KEYS.test(value)) {
      return null;
    }
    return value.slice(0, OBSERVABILITY_LIMITS.maxDetailChars);
  }

  isSafeMetadataKey(key: string): boolean {
    return !FORBIDDEN_KEYS.test(key);
  }
}
