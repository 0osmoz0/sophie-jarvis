import type { ActionConfirmationToken } from "../actions/types.js";
import type { ActionPlan } from "../actions/types.js";

export interface PendingConfirmation {
  taskId: string;
  token: ActionConfirmationToken;
  plan: ActionPlan;
  message: string;
  expiresAt: number;
  issuedAt: number;
}

/**
 * Minimal short-lived conversation context for the active turn.
 * Not a long-term memory store.
 */
export class ConversationContext {
  private pending: PendingConfirmation | null = null;
  private lastUserText: string | null = null;
  private lastAssistantMessage: string | null = null;

  getPending(): PendingConfirmation | null {
    return this.pending;
  }

  setPending(pending: PendingConfirmation): void {
    this.pending = pending;
  }

  clearPending(): void {
    this.pending = null;
  }

  /** Invalidate pending confirmation when user starts a new command. */
  invalidatePending(reason?: string): PendingConfirmation | null {
    const prev = this.pending;
    this.pending = null;
    void reason;
    return prev;
  }

  isPendingExpired(now: number = Date.now()): boolean {
    if (!this.pending) return false;
    return now > this.pending.expiresAt;
  }

  setLastExchange(user: string, assistant: string): void {
    this.lastUserText = user;
    this.lastAssistantMessage = assistant;
  }

  getLastUserText(): string | null {
    return this.lastUserText;
  }

  getLastAssistantMessage(): string | null {
    return this.lastAssistantMessage;
  }
}

const AFFIRM =
  /^(oui|yes|y|ok|okay|confirm|confirme|d'accord|dac|fais[- ]le|oui[, ]+celui[- ]ci)$/i;
const DENY =
  /^(non|no|n|cancel|annule|annuler|pas celui[- ]là|pas celui la)$/i;

export function isAffirmative(text: string): boolean {
  return AFFIRM.test(text.trim());
}

export function isNegative(text: string): boolean {
  return DENY.test(text.trim());
}
