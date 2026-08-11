import type { LLMProvider } from "./LLMProvider.js";
import type {
  LLMCapabilityReport,
  LLMUnderstandRequest,
  LLMUnderstandResult,
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
      /ignore (all )?previous|system administrator|execute shell/i.test(text) ||
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

    if (
      /^(range ça|ferme[- ]le|fais[- ]le|ouvre[- ]le)\.?$/i.test(text.trim()) ||
      lower === "range ca" ||
      lower === "ferme-le" ||
      lower === "ferme le" ||
      /^ferme tout\.?$/i.test(text.trim())
    ) {
      return this.wrapRaw(
        JSON.stringify({
          type: "needs_clarification",
          payload: {
            question: "Précise la cible (chemin ou application).",
          },
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
