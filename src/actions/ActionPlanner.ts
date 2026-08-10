import { randomUUID } from "node:crypto";
import type { ActionIntent, ActionPlan, ActionResult } from "./types.js";
import { ACTION_ERROR_CODES, isActionType } from "./types.js";
import { ActionRegistry } from "./ActionRegistry.js";
import { formatConfirmationMessage } from "./ActionConfirmation.js";

/**
 * ActionPlanner — structured ActionIntent → ActionPlan.
 * Does not interpret free-form language as a system command.
 */
export class ActionPlanner {
  constructor(private readonly registry: ActionRegistry) {}

  plan(
    intent: ActionIntent,
    options?: { dryRun?: boolean; taskId?: string },
  ): ActionResult<ActionPlan> {
    if (!isActionType(intent.type) || !this.registry.has(intent.type)) {
      return {
        success: false,
        error: {
          code: ACTION_ERROR_CODES.UNKNOWN_ACTION,
          message: `Unknown or unregistered action: ${String(intent.type)}`,
        },
      };
    }

    const def = this.registry.get(intent.type)!;
    if (
      !intent.payload ||
      typeof intent.payload !== "object" ||
      Array.isArray(intent.payload)
    ) {
      return {
        success: false,
        error: {
          code: ACTION_ERROR_CODES.INVALID_PAYLOAD,
          message: "Action payload must be a plain object",
        },
      };
    }

    const validated = def.validatePayload(intent.payload);
    if (!validated.ok) {
      return {
        success: false,
        error: {
          code: ACTION_ERROR_CODES.INVALID_PAYLOAD,
          message: validated.reason,
        },
      };
    }

    const taskId = options?.taskId ?? `action_${randomUUID()}`;
    const plan: ActionPlan = {
      taskId,
      actionType: def.actionType,
      payload: validated.payload,
      riskLevel: def.riskLevel,
      requiresConfirmation: def.requiresConfirmation,
      status: def.requiresConfirmation ? "CONFIRMATION_REQUIRED" : "PLANNED",
      createdAt: Date.now(),
      dryRun: options?.dryRun === true,
      confirmationMessage: formatConfirmationMessage({
        taskId,
        actionType: def.actionType,
        payload: validated.payload,
        riskLevel: def.riskLevel,
        requiresConfirmation: def.requiresConfirmation,
        status: "CONFIRMATION_REQUIRED",
        createdAt: Date.now(),
      }),
      resultCode: null,
      errorMessage: null,
      completedAt: null,
    };

    return { success: true, data: plan };
  }
}
