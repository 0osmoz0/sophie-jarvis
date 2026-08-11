import type { ResponseDraft, ResponseGenerateRequest } from "./types.js";

/**
 * Deterministic natural French wording from facts (fallback / polish base).
 * Never invents system state.
 */
export class ResponseDraftFormatter {
  fallback(request: ResponseGenerateRequest): string {
    if (request.fallbackText?.trim()) {
      return polish(request.fallbackText.trim());
    }
    switch (request.category) {
      case "ACTION_SUCCESS": {
        const app = fact(request, "action.application");
        const path = fact(request, "action.path");
        const kind = fact(request, "action.type");
        if (app && /open/i.test(kind ?? "")) return `${app} est ouvert.`;
        if (app && /close/i.test(kind ?? "")) return `${app} a été fermé.`;
        if (path && /delete/i.test(kind ?? "")) {
          return `Le fichier a été supprimé.`;
        }
        return request.actionResult?.summary ?? "C'est fait.";
      }
      case "ACTION_FAILURE":
        return (
          request.actionResult?.detail ??
          request.errors?.[0]?.message ??
          "Je n'ai pas réussi à effectuer cette action."
        );
      case "ACTION_DENIED":
        return (
          request.errors?.[0]?.message ??
          "Je ne peux pas faire ça avec les permissions actuelles."
        );
      case "ACTION_CANCELLED":
        return "D'accord, j'annule.";
      case "ACTION_TIMEOUT":
        return "La confirmation a expiré. Reformule ta demande pour recommencer.";
      case "ACTION_CONFIRMATION":
        return (
          request.actionResult?.summary ??
          "Je peux le faire, mais j'ai besoin de ta confirmation."
        );
      case "CLARIFICATION":
        return (
          request.clarificationQuestion?.trim() ||
          "Tu peux préciser ?"
        );
      case "REFUSAL":
        return (
          request.errors?.[0]?.message ??
          "Je ne peux pas traiter cette demande."
        );
      case "NO_ACTION":
        return "D'accord.";
      case "DEFER":
        return "Je ne peux pas faire ça pour le moment.";
      case "ERROR":
        return (
          request.errors?.[0]?.message ?? "Une erreur s'est produite."
        );
      case "ANSWER": {
        if (request.contextResult) {
          if (!request.contextResult.available) {
            return (
              request.contextResult.reason ??
              "Je ne peux pas accéder à ces informations actuellement."
            );
          }
          return (
            request.contextResult.summary ??
            "Voici ce que je vois."
          );
        }
        if (request.securityAssessment) {
          const s = request.securityAssessment;
          const base =
            s.summary ??
            "J'ai une évaluation de sécurité à partager.";
          const disc =
            s.disclaimer ??
            "Mode détection uniquement — pas de confirmation d'intrusion.";
          return `${base} ${disc}`;
        }
        if (request.memoryHints?.length) {
          return `Voici ce dont je me souviens : ${request.memoryHints
            .map((m) => m.content)
            .join(" ; ")}`;
        }
        return "Je t'écoute.";
      }
      default:
        return "Je t'écoute.";
    }
  }

  finalize(draft: ResponseDraft, maxChars: number): ResponseDraft {
    return {
      ...draft,
      text: polish(draft.text).slice(0, maxChars),
    };
  }
}

function fact(
  request: ResponseGenerateRequest,
  key: string,
): string | undefined {
  return request.facts.find((f) => f.key === key)?.value;
}

function polish(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([?.!,;])/g, "$1")
    .trim();
}
