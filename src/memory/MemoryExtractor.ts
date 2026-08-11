/**
 * Controlled extraction of MemoryCandidate from user text / LLM JSON.
 * LLM never writes to MemoryStore directly.
 */
import type { MemoryCandidate } from "./types.js";

/**
 * Parse LLM output that may contain memory candidates.
 * Accepts a single object or `{ memories: [...] }` / `{ candidates: [...] }`.
 */
export function parseMemoryCandidatesFromLlm(raw: unknown): MemoryCandidate[] {
  if (raw == null) return [];
  let value = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value.filter(isLooseCandidate);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.memories)) {
      return obj.memories.filter(isLooseCandidate);
    }
    if (Array.isArray(obj.candidates)) {
      return obj.candidates.filter(isLooseCandidate);
    }
    if (typeof obj.kind === "string" && typeof obj.content === "string") {
      return [obj as unknown as MemoryCandidate];
    }
  }
  return [];
}

/**
 * Heuristic explicit memory commands from user text (FR/EN).
 * Priority over silent extraction.
 */
export function extractExplicitMemoryCommand(text: string): {
  action: "remember" | "forget" | "list" | "recall" | null;
  content?: string;
  query?: string;
} {
  const t = text.trim();

  const remember = t.match(
    /^(retiens|souviens[- ]toi|enregistre|remember|note)(\s+que)?\s+(.+)$/i,
  );
  if (remember?.[3]) {
    return { action: "remember", content: remember[3].trim() };
  }

  const forget = t.match(/^(oublie|forget|efface|supprime)(\s+que)?\s+(.+)$/i);
  if (forget?.[3]) {
    return { action: "forget", query: forget[3].trim() };
  }

  if (
    /^(qu['’]est[- ]ce que tu (sais|connais) (sur|de) moi|what do you (know|remember) about me|liste (mes )?souvenirs|list (my )?memories)\??$/i.test(
      t,
    )
  ) {
    return { action: "list" };
  }

  if (
    /^(de quoi (te )?souviens[- ]tu|what do you remember|recall)\b/i.test(t)
  ) {
    return { action: "recall", query: t };
  }

  return { action: null };
}

/**
 * Lightweight candidate guess for explicit remember content (no LLM required).
 */
export function candidateFromExplicitRemember(
  content: string,
): MemoryCandidate {
  const folded = content
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  let kind: MemoryCandidate["kind"] = "fact";
  if (
    /prefer/.test(folded) ||
    /\b(aime|like|plutot)\b/.test(folded)
  ) {
    kind = "preference";
  } else if (/\b(objectif|goal|veux devenir|want to)\b/.test(folded)) {
    kind = "goal";
  } else if (/\b(projet|project)\b/.test(folded)) {
    kind = "project";
  } else if (
    /\b(copine|boyfriend|girlfriend|ami|friend|relation)\b/.test(folded)
  ) {
    kind = "relationship";
  } else if (/\b(contrainte|constraint|jamais|never|interdit)\b/.test(folded)) {
    kind = "constraint";
  } else if (/\b(decide|decision|desormais|from now)\b/.test(folded)) {
    kind = "decision";
  }

  const tags: string[] = [];
  if (/\b(vs\s*code|vscode|cursor|ide)\b/.test(folded)) tags.push("ide");
  if (/\bsophie\b/.test(folded)) tags.push("sophie");
  if (/\bjarvis\b/.test(folded)) tags.push("jarvis");

  return {
    kind,
    content,
    importance: 0.75,
    confidence: 0.95,
    source: "user_explicit",
    tags,
  };
}

function isLooseCandidate(v: unknown): v is MemoryCandidate {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as MemoryCandidate).kind === "string" &&
    typeof (v as MemoryCandidate).content === "string"
  );
}
