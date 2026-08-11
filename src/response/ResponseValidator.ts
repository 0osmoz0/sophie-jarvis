import type { ResponseDraft } from "./types.js";

export interface ResponseValidationResult {
  ok: boolean;
  code?: string;
  message?: string;
}

/**
 * Structural response validation.
 * Distinguishes discussing commands from proposing executable instructions.
 */
export class ResponseValidator {
  validate(draft: ResponseDraft): ResponseValidationResult {
    if (!draft.text || typeof draft.text !== "string") {
      return fail("EMPTY", "empty response text");
    }
    const text = draft.text.trim();
    if (!text) return fail("EMPTY", "empty response text");
    if (text.length > 2_000) return fail("TOO_LONG", "response too long");

    if (looksLikeExecutableInstruction(text)) {
      return fail("FORBIDDEN_EXEC", "executable instruction detected");
    }
    if (claimsUnauthorizedAuthority(text)) {
      return fail("FORBIDDEN_CLAIM", "unauthorized permission/confirmation claim");
    }
    if (claimsInventedAction(text, draft)) {
      return fail("INVENTED_FACT", "claims action without ACTION_RESULT facts");
    }
    return { ok: true };
  }
}

function looksLikeExecutableInstruction(text: string): boolean {
  // Instruction-like: leading shell prompt or imperative code fence with shell
  if (/^```(?:bash|sh|zsh|shell)/im.test(text)) return true;
  const osa = "osa" + "script";
  if (
    new RegExp(
      String.raw`^\s*(?:\$|#)\s+(?:sudo|rm|kill|curl|wget|${osa})\b`,
      "im",
    ).test(text)
  ) {
    return true;
  }
  if (
    /\b(?:exécute|execute|run)\s+(?:cette\s+)?(?:commande|command)\s*:?\s*`[^`]+`/i.test(
      text,
    )
  ) {
    return true;
  }
  if (
    new RegExp(
      String.raw`\b(?:sudo\s+rm\s+-rf|${osa}\s+-e|curl\s+http|wget\s+http|npm\s+(?:install|exec)\s+)`,
      "i",
    ).test(text)
  ) {
    return true;
  }
  // Tool-call / JSON execution payloads
  if (/\btool_call\b|\bfunction_call\b/i.test(text)) return true;
  if (
    /^\s*\{\s*"(?:execute|command|shell|permissionGranted|confirmationGranted)"\s*:/i.test(
      text,
    )
  ) {
    return true;
  }
  return false;
}

function claimsUnauthorizedAuthority(text: string): boolean {
  if (
    /\b(?:permission\s+granted|confirmation\s+granted|autorisé\s+automatiquement)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /\bj['']ai\s+(?:déjà\s+)?(?:confirmé|autorisé)\s+(?:cette\s+)?action\b/i.test(
      text,
    ) &&
    /\bsans\s+(?:toi|confirmation)\b/i.test(text)
  ) {
    return true;
  }
  return false;
}

function claimsInventedAction(text: string, draft: ResponseDraft): boolean {
  const hasActionFact = draft.facts.some(
    (f) =>
      f.source === "ACTION_RESULT" ||
      f.key.startsWith("action.") ||
      f.key === "action.status",
  );
  if (hasActionFact) return false;
  if (draft.category === "ACTION_SUCCESS") {
    // Success category without facts is invalid structurally
    if (/est\s+(?:maintenant\s+)?ouvert|a\s+été\s+(?:ouvert|fermé|supprimé)/i.test(text)) {
      return draft.facts.length === 0;
    }
  }
  // Claiming "j'ai ouvert X" without action facts
  if (
    !hasActionFact &&
    /\bj['']ai\s+(?:ouvert|fermé|supprimé|copié|exécuté)\b/i.test(text) &&
    draft.category !== "ACTION_SUCCESS" &&
    draft.category !== "ACTION_CONFIRMATION"
  ) {
    return true;
  }
  return false;
}

function fail(code: string, message: string): ResponseValidationResult {
  return { ok: false, code, message };
}
