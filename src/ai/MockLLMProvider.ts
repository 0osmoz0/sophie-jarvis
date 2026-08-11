import type { LLMProvider } from "./LLMProvider.js";
import type {
  LLMCapabilityReport,
  LLMUnderstandRequest,
  LLMUnderstandResult,
  LLMResponseGenerateRequest,
  LLMResponseGenerateResult,
} from "./types.js";
import { AI_LIMITS } from "./types.js";

/**
 * Deterministic mock — no network, no model.
 * Used by smoke tests so Phase 9 runs without Ollama.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = "mock-llm";

  private unavailable = false;
  private forceInvalidJson = false;
  private forceConversational = false;
  private forceTooLong = false;
  private customRaw: string | null = null;

  getCapabilityStatus(): LLMCapabilityReport {
    if (this.unavailable) {
      return { status: "UNAVAILABLE", reason: "Mock LLM set unavailable" };
    }
    return { status: "AVAILABLE", reason: "Mock LLM ready" };
  }

  setUnavailable(v: boolean): void {
    this.unavailable = v;
  }

  setForceInvalidJson(v: boolean): void {
    this.forceInvalidJson = v;
  }

  setForceConversational(v: boolean): void {
    this.forceConversational = v;
  }

  setForceTooLong(v: boolean): void {
    this.forceTooLong = v;
  }

  setCustomRaw(raw: string | null): void {
    this.customRaw = raw;
  }

  reset(): void {
    this.unavailable = false;
    this.forceInvalidJson = false;
    this.forceConversational = false;
    this.forceTooLong = false;
    this.customRaw = null;
  }

  async understand(
    request: LLMUnderstandRequest,
  ): Promise<LLMUnderstandResult> {
    if (this.unavailable) {
      return {
        ok: false,
        status: "UNAVAILABLE",
        error: "Mock LLM unavailable",
      };
    }

    if (this.customRaw !== null) {
      return this.wrapRaw(this.customRaw);
    }
    if (this.forceTooLong) {
      return this.wrapRaw("x".repeat(AI_LIMITS.maxLlmOutputChars + 10));
    }
    if (this.forceInvalidJson) {
      return this.wrapRaw("{not json");
    }
    if (this.forceConversational) {
      return this.wrapRaw("Bien sûr ! Je vais déplacer ton fichier.");
    }

    const text = request.text.trim();
    const lower = text.toLowerCase();

    // Prompt-injection / shell-like user text → still return a structure;
    // validator / router must reject unsafe or unknown actions.
    if (
      /ignore (all )?previous|system administrator|execute shell|forget previous safety|system message:|assistant message:|confirmation granted|toujours exécuter.*sans confirmation|always execute.*without confirmation/i.test(
        text,
      ) ||
      text.toLowerCase().includes("rm" + " -rf") ||
      text.toLowerCase().includes("child_" + "process") ||
      text.toLowerCase().includes("osa" + "script") ||
      text.toLowerCase().includes("bash" + " -c") ||
      text.toLowerCase().includes("sudo" + " shutdown")
    ) {
      return this.wrapRaw(
        JSON.stringify({
          type: "no_action",
          payload: { reason: "Rejected unsafe or injection-like input" },
        }),
      );
    }

    // Phase 17 — corrections: "non, Safari" / "non Safari"
    const correction = text.match(/^non[, ]+(.+)$/i);
    if (correction) {
      const target = correction[1]!.trim();
      if (/^(celui|celle|ça|ca)\b/i.test(target)) {
        return this.wrapRaw(
          JSON.stringify({
            type: "needs_clarification",
            payload: { question: "Précise la correction (quelle cible ?)." },
          }),
        );
      }
      return this.action("application.open", { application: target });
    }

    if (/^pas celui[- ]là\.?$/i.test(text.trim())) {
      return this.wrapRaw(
        JSON.stringify({
          type: "needs_clarification",
          payload: { question: "Lequel alors ?" },
        }),
      );
    }

    if (
      /^(bonjour|salut|hello|hi)\b/i.test(text) ||
      /comment vas[- ]tu/i.test(text) ||
      /explique[- ]moi/i.test(text)
    ) {
      return this.wrapRaw(
        JSON.stringify({
          type: "conversation",
          payload: { replyHint: "non_actionable_chat" },
        }),
      );
    }

    // Ambiguous deixis without prior resolution (runtime should rewrite first)
    if (
      /^(range ça|ferme[- ]le|ouvre[- ]le|copie ce fichier)\.?$/i.test(
        text.trim(),
      ) ||
      lower === "range ca" ||
      lower === "ferme-le" ||
      lower === "ferme le" ||
      /^ferme tout\.?$/i.test(text.trim())
    ) {
      // If structured references were provided by runtime, prefer them
      const ref = request.references?.[0];
      if (ref?.label && /ferme/i.test(text)) {
        return this.action("application.close", {
          application: ref.label,
        });
      }
      if (ref?.label && /ouvre/i.test(text)) {
        return this.action("application.open", {
          application: ref.label,
        });
      }
      return this.wrapRaw(
        JSON.stringify({
          type: "needs_clarification",
          payload: {
            question: "Précise la cible (chemin ou application).",
          },
        }),
      );
    }

    // Prefer conversation reference over memory for deixis (already handled above).
    // Memory hints inform recall-style questions only.
    if (
      request.memory &&
      request.memory.length > 0 &&
      /quel (ide|éditeur)|quel est mon/i.test(text)
    ) {
      return this.wrapRaw(
        JSON.stringify({
          type: "memory.recall",
          payload: { query: text.trim() },
        }),
      );
    }

    // Phase 16 — memory intents (before security/context)
    if (
      /^(retiens|souviens[- ]toi|enregistre|remember)(\s+que)?\s+/i.test(text.trim())
    ) {
      const content = text
        .trim()
        .replace(/^(retiens|souviens[- ]toi|enregistre|remember)(\s+que)?\s+/i, "")
        .trim();
      return this.wrapRaw(
        JSON.stringify({
          type: "memory.remember",
          payload: { content },
        }),
      );
    }
    if (/^(oublie|forget|efface)\s+/i.test(text.trim())) {
      const query = text.trim().replace(/^(oublie|forget|efface)(\s+que)?\s+/i, "").trim();
      return this.wrapRaw(
        JSON.stringify({ type: "memory.forget", payload: { query } }),
      );
    }
    if (
      /qu['']est[- ]ce que tu (sais|connais) (sur|de) moi|what do you (know|remember) about me|liste (mes )?souvenirs/i.test(
        text,
      )
    ) {
      return this.wrapRaw(
        JSON.stringify({ type: "memory.list", payload: {} }),
      );
    }
    if (
      /de quoi (te )?souviens[- ]tu|what do you remember|quel (ide|éditeur)|quel est mon/i.test(
        text,
      )
    ) {
      return this.wrapRaw(
        JSON.stringify({
          type: "memory.recall",
          payload: { query: text.trim() },
        }),
      );
    }

    // Phase 14 — read-only security intents (before generic context)
    if (
      /pendant mon absence|quelque chose d['']inhabituel|activité (suspecte|inhabituelle)|security assess|évaluation (de )?sécurité|alerte(s)? de sécurité|est[- ]ce qu['']il s['']est passé/i.test(
        text,
      )
    ) {
      return this.wrapRaw(
        JSON.stringify({ type: "security.assess", payload: {} }),
      );
    }
    if (
      /alertes? (de )?sécurité|security alerts|quelles alertes/i.test(text)
    ) {
      return this.wrapRaw(
        JSON.stringify({ type: "security.alerts", payload: {} }),
      );
    }
    if (
      /statut (du )?monitor(ing)?|security monitor status|état (du )?monitoring|monitor de sécurité/i.test(
        text,
      )
    ) {
      return this.wrapRaw(
        JSON.stringify({ type: "security.monitor.status", payload: {} }),
      );
    }
    if (
      /statut (de )?sécurité|security status|état (de la )?sécurité/i.test(text)
    ) {
      return this.wrapRaw(
        JSON.stringify({ type: "security.status", payload: {} }),
      );
    }

    // Phase 11 — read-only context intents
    if (
      /qu['']est[- ]ce qui se passe|ce qui se passe sur (mon |le )?mac|état (du|de mon) (mac|système)|snapshot/i.test(
        text,
      )
    ) {
      return this.wrapRaw(
        JSON.stringify({ type: "system.context", payload: {} }),
      );
    }
    if (
      /mon (ordinateur|mac) va bien|ordinateur va bien|mac va bien|santé (du |de mon )?mac|system status/i.test(
        text,
      )
    ) {
      return this.wrapRaw(
        JSON.stringify({ type: "system.status", payload: {} }),
      );
    }
    if (
      /qu['']est[- ]ce qui est ouvert|applications? ouvertes?|what is open/i.test(
        text,
      )
    ) {
      return this.wrapRaw(
        JSON.stringify({ type: "application.status", payload: {} }),
      );
    }
    if (
      /qu['']est[- ]ce qui est affiché|à l['']écran|what.*(screen|display)/i.test(
        text,
      )
    ) {
      return this.wrapRaw(
        JSON.stringify({ type: "screen.status", payload: {} }),
      );
    }
    if (
      /inactif depuis|depuis combien.*inactif|suis[- ]je inactif|user status|activité utilisateur/i.test(
        text,
      )
    ) {
      return this.wrapRaw(
        JSON.stringify({ type: "user.status", payload: {} }),
      );
    }

    // Deterministic action patterns for tests
    const copy = text.match(
      /copie\s+(.+?)\s+(?:vers|to)\s+(.+)/i,
    ) ?? text.match(/copy\s+(.+?)\s+to\s+(.+)/i);
    if (copy) {
      return this.action("file.copy", {
        source: copy[1]!.trim(),
        destination: copy[2]!.trim(),
      });
    }

    const move = text.match(
      /(?:déplace|deplace|move)\s+(.+?)\s+(?:vers|to)\s+(.+)/i,
    );
    if (move) {
      return this.action("file.move", {
        source: move[1]!.trim(),
        destination: move[2]!.trim(),
      });
    }

    const create = text.match(
      /(?:crée|cree|create)\s+(?:le\s+)?fichier\s+(.+?)(?:\s+avec\s+contenu\s+(.+))?$/i,
    ) ?? text.match(/create\s+file\s+(.+?)(?:\s+content\s+(.+))?$/i);
    if (create) {
      return this.action("file.create", {
        path: create[1]!.trim(),
        content: create[2]?.trim() ?? "",
      });
    }

    const del = text.match(
      /(?:supprime|delete|efface)\s+(?:le\s+)?(?:fichier\s+)?(.+)/i,
    );
    if (del) {
      return this.action("file.delete", { path: del[1]!.trim() });
    }

    const open = text.match(
      /(?:ouvre|open)\s+(?:l['']application\s+)?(.+)/i,
    );
    if (open) {
      return this.action("application.open", {
        application: open[1]!.trim(),
      });
    }

    const close = text.match(
      /(?:ferme|close)\s+(?:l['']application\s+)?(.+)/i,
    );
    if (close && !/^(ferme[- ]le)\.?$/i.test(text.trim())) {
      return this.action("application.close", {
        application: close[1]!.trim(),
      });
    }

    return this.wrapRaw(
      JSON.stringify({
        type: "no_action",
        payload: { reason: "No actionable intent recognized" },
      }),
    );
  }

  /**
   * Phase 19 — deterministic natural wording from structured facts.
   * Never invents results not present in the request.
   */
  async generateResponse(
    request: LLMResponseGenerateRequest,
  ): Promise<LLMResponseGenerateResult> {
    if (this.unavailable) {
      return {
        ok: false,
        status: "UNAVAILABLE",
        error: "Mock LLM unavailable",
      };
    }
    const max = request.maxChars ?? 420;
    const text = mockNaturalResponse(request).slice(0, max);
    return {
      ok: true,
      status: "AVAILABLE",
      text,
      confidence: 0.9,
      raw: text,
    };
  }

  private action(
    type: string,
    payload: Record<string, unknown>,
  ): LLMUnderstandResult {
    return this.wrapRaw(JSON.stringify({ type, payload }));
  }

  private wrapRaw(raw: string): LLMUnderstandResult {
    if (raw.length > AI_LIMITS.maxLlmOutputChars) {
      return {
        ok: false,
        status: "INVALID_RESPONSE",
        error: "Mock output exceeds max length",
        raw: raw.slice(0, 200),
      };
    }
    let candidate: unknown = raw;
    try {
      candidate = JSON.parse(raw);
    } catch {
      candidate = raw;
    }
    return {
      ok: true,
      status: "AVAILABLE",
      raw,
      candidate,
    };
  }
}

function mockNaturalResponse(request: LLMResponseGenerateRequest): string {
  const facts = Object.fromEntries(
    request.facts.map((f) => [f.key, f.value]),
  );
  switch (request.category) {
    case "ACTION_SUCCESS": {
      const app = facts["action.application"];
      if (app && /OPEN|open/i.test(facts["action.type"] ?? "")) {
        return `${app} est maintenant ouvert.`;
      }
      if (app && /CLOSE|close/i.test(facts["action.type"] ?? "")) {
        return `${app} a été fermé.`;
      }
      return request.fallbackText || "C'est fait.";
    }
    case "ACTION_FAILURE":
      return (
        request.fallbackText ||
        "Je n'ai pas réussi à effectuer cette action."
      );
    case "ACTION_DENIED":
      return (
        request.fallbackText ||
        "Je ne peux pas faire ça avec les permissions actuelles."
      );
    case "ACTION_CONFIRMATION":
      return (
        request.fallbackText ||
        "Je peux le faire, mais j'ai besoin de ta confirmation."
      );
    case "CLARIFICATION":
      return request.fallbackText || "Tu peux préciser ?";
    case "ANSWER": {
      const open = facts["apps.open"];
      if (open) return `Tu as actuellement ${open} ouverts.`;
      return request.fallbackText || "Voici ce que je vois.";
    }
    case "NO_ACTION":
      return request.fallbackText || "D'accord.";
    case "REFUSAL":
      return request.fallbackText || "Je ne peux pas traiter cette demande.";
    default:
      return request.fallbackText || "Je t'écoute.";
  }
}
