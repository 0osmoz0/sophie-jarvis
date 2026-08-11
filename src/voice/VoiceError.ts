/**
 * Phase 23 — Voice error helpers (safe messages only).
 */

import type { VoiceErrorCode } from "./types.js";

export interface VoiceError {
  code: VoiceErrorCode;
  message: string;
  retryable: boolean;
}

export function createVoiceError(
  code: VoiceErrorCode,
  message: string,
  retryable = false,
): VoiceError {
  return {
    code,
    message: message.replace(/\s+/g, " ").trim().slice(0, 160),
    retryable,
  };
}

export function userMessageForVoiceError(code: VoiceErrorCode): string {
  switch (code) {
    case "VOICE_PERMISSION_REQUIRED":
      return "Le microphone n'est pas autorisé. Active la permission dans Réglages Système.";
    case "VOICE_MICROPHONE_UNAVAILABLE":
      return "Aucun microphone disponible.";
    case "VOICE_STT_UNAVAILABLE":
      return "La reconnaissance vocale est indisponible.";
    case "VOICE_STT_TIMEOUT":
      return "La reconnaissance vocale a expiré.";
    case "VOICE_STT_FAILED":
      return "Je n'ai pas pu transcrire l'audio.";
    case "VOICE_STT_EMPTY":
      return "Je n'ai rien entendu de clair.";
    case "VOICE_STT_LOW_CONFIDENCE":
      return "Je n'ai pas bien compris. Peux-tu reformuler ?";
    case "VOICE_TTS_UNAVAILABLE":
    case "VOICE_TTS_FAILED":
      return "Synthèse vocale indisponible — voici la réponse en texte.";
    case "VOICE_INTERRUPTED":
      return "Écoute interrompue.";
    case "VOICE_CANCELLED":
      return "Écoute annulée.";
    case "VOICE_BUSY":
      return "Une requête vocale est déjà en cours.";
    default:
      return "Une erreur vocale est survenue.";
  }
}
