import type { ActionPlan, ActionType } from "../actions/types.js";
import type { JarvisResponse } from "./types.js";

/**
 * Human-friendly responses — no stack traces, no internal dumps.
 */
export class ResponseFormatter {
  greeting(): JarvisResponse {
    return { type: "message", message: "Bonjour." };
  }

  conversation(hint?: string): JarvisResponse {
    if (hint === "non_actionable_chat") {
      return {
        type: "message",
        message: "Je suis là. Dis-moi ce que tu veux faire.",
      };
    }
    return {
      type: "message",
      message: "Je t'écoute. Que puis-je faire pour toi ?",
    };
  }

  contextMessage(
    message: string,
    _snapshot?: unknown,
  ): JarvisResponse {
    return { type: "message", message };
  }

  securityMessage(message: string): JarvisResponse {
    return { type: "message", message };
  }

  noAction(reason?: string): JarvisResponse {
    return {
      type: "message",
      message: reason?.trim()
        ? `Je ne peux pas traiter ça comme une action. ${reason}`
        : "Je n'ai pas détecté d'action à effectuer.",
    };
  }

  clarification(question: string): JarvisResponse {
    return {
      type: "clarification",
      message:
        question.trim() ||
        "Je ne suis pas sûr de ce que tu veux faire. Peux-tu préciser ?",
      options: undefined,
    };
  }

  confirmationRequired(
    plan: ActionPlan,
    message: string,
    expiresAt: number,
  ): JarvisResponse {
    return {
      type: "confirmation_required",
      taskId: plan.taskId,
      message: `${message}\n\nConfirmation requise.\n[oui/non]`,
      expiresAt,
    };
  }

  executed(
    taskId: string,
    actionType: ActionType,
    result: unknown,
    message?: string,
  ): JarvisResponse {
    return {
      type: "executed",
      taskId,
      message: message?.trim() || successMessage(actionType, result),
      result,
    };
  }

  cancelled(taskId: string): JarvisResponse {
    return {
      type: "cancelled",
      taskId,
      message: "D'accord, j'annule.",
    };
  }

  expired(): JarvisResponse {
    return {
      type: "error",
      code: "CONFIRMATION_EXPIRED",
      message:
        "La confirmation a expiré. Reformule ta demande pour recommencer.",
    };
  }

  noPendingConfirmation(): JarvisResponse {
    return {
      type: "error",
      code: "NO_PENDING_CONFIRMATION",
      message: "Aucune action en attente de confirmation.",
    };
  }

  denied(reason?: string): JarvisResponse {
    return {
      type: "error",
      code: "PERMISSION_DENIED",
      message: reason?.trim()
        ? `Je n'ai pas l'autorisation de faire ça. ${reason}`
        : "Je n'ai pas l'autorisation de faire ça.",
    };
  }

  unavailable(detail?: string): JarvisResponse {
    return {
      type: "error",
      code: "UNAVAILABLE",
      message: detail?.trim()
        ? `Cette fonction n'est pas disponible. ${detail}`
        : "Cette fonction n'est pas encore disponible sur ce Mac.",
    };
  }

  llmUnavailable(detail?: string): JarvisResponse {
    return {
      type: "error",
      code: "LLM_UNAVAILABLE",
      message: detail?.trim()
        ? `Le moteur de compréhension est indisponible. ${detail}`
        : "Le moteur de compréhension local est indisponible.",
    };
  }

  error(code: string, message: string): JarvisResponse {
    return {
      type: "error",
      code,
      message: sanitize(message),
    };
  }

  formatCli(response: JarvisResponse): string {
    switch (response.type) {
      case "message":
      case "clarification":
        return response.message;
      case "confirmation_required":
        return response.message;
      case "executed":
        return response.message;
      case "cancelled":
        return response.message;
      case "error":
        return response.message;
    }
  }
}

function successMessage(actionType: ActionType, result?: unknown): string {
  const app =
    result &&
    typeof result === "object" &&
    result !== null &&
    "application" in result &&
    typeof (result as { application?: unknown }).application === "string"
      ? (result as { application: string }).application
      : null;
  switch (actionType) {
    case "FILE_COPY":
      return "C'est fait, le fichier a été copié.";
    case "FILE_MOVE":
      return "C'est fait, le fichier a été déplacé.";
    case "FILE_CREATE":
      return "Le fichier a été créé.";
    case "FILE_DELETE":
      return "Le fichier a été supprimé.";
    case "APP_OPEN":
      return app ? `${app} est ouvert.` : "J'ai ouvert l'application.";
    case "APP_CLOSE":
      return app ? `${app} a été fermé.` : "L'application a été fermée.";
  }
}

function sanitize(message: string): string {
  return message.replace(/\n\s*at\s+.+/g, "").slice(0, 500);
}
