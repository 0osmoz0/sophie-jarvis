/**
 * Phase 22 — JSON extraction helpers for Ollama output.
 * Conservative: never invent intents from ambiguous text.
 */

export type JsonExtractResult =
  | { ok: true; jsonText: string }
  | { ok: false; reason: "empty" | "no_object" | "ambiguous" };

/**
 * Extract a single JSON object from model output.
 * Rejects plain text, multiple root objects, and empty input.
 * Allows optional markdown fences around one object.
 */
export function extractJsonObjectSafe(raw: string): JsonExtractResult {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, reason: "empty" };
  }
  let text = raw.trim();
  // Strip markdown fence if present
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fence?.[1]) {
    text = fence[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { ok: false, reason: "no_object" };
  }

  // Reject obvious multiple top-level objects: "}{"
  const candidate = text.slice(start, end + 1);
  if (/\}\s*\{/.test(candidate)) {
    return { ok: false, reason: "ambiguous" };
  }

  // Reject trailing/leading prose that looks like a second payload
  const before = text.slice(0, start).trim();
  const after = text.slice(end + 1).trim();
  if (before && !/^```/.test(before) && before.length > 40) {
    return { ok: false, reason: "ambiguous" };
  }
  if (after && !/^```/.test(after) && after.length > 20) {
    return { ok: false, reason: "ambiguous" };
  }

  return { ok: true, jsonText: candidate };
}

export function parseJsonCandidate(
  raw: string,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  const extracted = extractJsonObjectSafe(raw);
  if (!extracted.ok) {
    return { ok: false, reason: extracted.reason };
  }
  try {
    const value = JSON.parse(extracted.jsonText) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, reason: "not_object" };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
