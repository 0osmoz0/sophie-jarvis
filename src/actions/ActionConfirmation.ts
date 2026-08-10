import type {
  ActionConfirmationRequest,
  ActionConfirmationToken,
  ActionPayload,
  ActionPlan,
  ActionType,
} from "./types.js";
import { ACTION_ERROR_CODES } from "./types.js";
import { hashPayload } from "./payloadValidation.js";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface ActionConfirmationOptions {
  ttlMs?: number;
  now?: () => number;
}

/**
 * ActionConfirmation — bound to taskId + actionType + payloadHash.
 * Single-use; cannot authorize a different action or payload.
 */
export class ActionConfirmation {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly issued = new Map<string, ActionConfirmationToken>();
  private readonly consumed = new Set<string>();

  constructor(options: ActionConfirmationOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  buildRequest(plan: ActionPlan): ActionConfirmationRequest {
    return {
      taskId: plan.taskId,
      actionType: plan.actionType,
      message: formatConfirmationMessage(plan),
      riskLevel: plan.riskLevel,
      expiresAt: this.now() + this.ttlMs,
    };
  }

  issue(plan: ActionPlan): ActionConfirmationToken {
    const token: ActionConfirmationToken = {
      taskId: plan.taskId,
      actionType: plan.actionType,
      payloadHash: hashPayload(plan.payload),
      expiresAt: this.now() + this.ttlMs,
    };
    this.issued.set(plan.taskId, token);
    this.consumed.delete(plan.taskId);
    return token;
  }

  /**
   * Validate a confirmation against the plan. On success, consume the token.
   */
  consume(
    plan: ActionPlan,
    token: ActionConfirmationToken,
  ): { ok: true } | { ok: false; code: string; message: string } {
    if (token.taskId !== plan.taskId) {
      return {
        ok: false,
        code: ACTION_ERROR_CODES.CROSS_TASK_CONFIRMATION,
        message: "Confirmation taskId does not match plan",
      };
    }
    if (token.actionType !== plan.actionType) {
      return {
        ok: false,
        code: ACTION_ERROR_CODES.INVALID_CONFIRMATION,
        message: "Confirmation actionType does not match plan",
      };
    }
    const expectedHash = hashPayload(plan.payload);
    if (token.payloadHash !== expectedHash) {
      return {
        ok: false,
        code: ACTION_ERROR_CODES.INVALID_CONFIRMATION,
        message: "Confirmation payload binding mismatch",
      };
    }
    if (this.now() > token.expiresAt) {
      return {
        ok: false,
        code: ACTION_ERROR_CODES.EXPIRED_CONFIRMATION,
        message: "Confirmation token expired",
      };
    }
    const issued = this.issued.get(plan.taskId);
    if (!issued) {
      return {
        ok: false,
        code: ACTION_ERROR_CODES.INVALID_CONFIRMATION,
        message: "No confirmation was issued for this plan",
      };
    }
    if (
      issued.payloadHash !== token.payloadHash ||
      issued.actionType !== token.actionType ||
      issued.expiresAt !== token.expiresAt
    ) {
      return {
        ok: false,
        code: ACTION_ERROR_CODES.INVALID_CONFIRMATION,
        message: "Confirmation token does not match issued token",
      };
    }
    if (this.consumed.has(plan.taskId)) {
      return {
        ok: false,
        code: ACTION_ERROR_CODES.INVALID_CONFIRMATION,
        message: "Confirmation token already consumed",
      };
    }
    this.consumed.add(plan.taskId);
    return { ok: true };
  }

  /** Peek validity without consuming (for approve step). */
  validateForApprove(
    plan: ActionPlan,
    token: ActionConfirmationToken,
  ): { ok: true } | { ok: false; code: string; message: string } {
    if (token.taskId !== plan.taskId) {
      return {
        ok: false,
        code: ACTION_ERROR_CODES.CROSS_TASK_CONFIRMATION,
        message: "Confirmation taskId does not match plan",
      };
    }
    if (token.actionType !== plan.actionType) {
      return {
        ok: false,
        code: ACTION_ERROR_CODES.INVALID_CONFIRMATION,
        message: "Confirmation actionType does not match plan",
      };
    }
    if (token.payloadHash !== hashPayload(plan.payload)) {
      return {
        ok: false,
        code: ACTION_ERROR_CODES.INVALID_CONFIRMATION,
        message: "Confirmation payload binding mismatch",
      };
    }
    if (this.now() > token.expiresAt) {
      return {
        ok: false,
        code: ACTION_ERROR_CODES.EXPIRED_CONFIRMATION,
        message: "Confirmation token expired",
      };
    }
    const issued = this.issued.get(plan.taskId);
    if (!issued || issued.payloadHash !== token.payloadHash) {
      return {
        ok: false,
        code: ACTION_ERROR_CODES.INVALID_CONFIRMATION,
        message: "No matching confirmation issued",
      };
    }
    return { ok: true };
  }

  isApproved(taskId: string): boolean {
    return this.consumed.has(taskId) || this.issued.has(taskId);
  }
}

export function formatConfirmationMessage(plan: ActionPlan): string {
  const p = plan.payload as ActionPayload & Record<string, unknown>;
  switch (plan.actionType) {
    case "FILE_COPY":
      return `JARVIS veut copier :\n\n${p.source}\n\nvers :\n\n${p.destination}\n\nConfirmer ?`;
    case "FILE_MOVE":
      return `JARVIS veut déplacer :\n\n${p.source}\n\nvers :\n\n${p.destination}\n\nConfirmer ?`;
    case "FILE_CREATE":
      return `JARVIS veut créer le fichier :\n\n${p.path}\n\nConfirmer ?`;
    case "FILE_DELETE":
      return `JARVIS veut supprimer :\n\n${p.path}\n\nConfirmer ?`;
    case "APP_OPEN":
      return `JARVIS veut ouvrir l'application :\n\n${p.applicationId}\n\nConfirmer ?`;
    case "APP_CLOSE":
      return `JARVIS veut fermer l'application :\n\n${p.applicationId}\n\nConfirmer ?`;
  }
}

export function createBoundToken(
  taskId: string,
  actionType: ActionType,
  payload: ActionPayload,
  expiresAt: number,
): ActionConfirmationToken {
  return {
    taskId,
    actionType,
    payloadHash: hashPayload(payload),
    expiresAt,
  };
}
