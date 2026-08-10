import type { ActionPlan, ActionRollbackInfo, ActionResult } from "./types.js";
import { ACTION_ERROR_CODES } from "./types.js";
import type { ActionExecutor } from "./ActionExecutor.js";

/**
 * ActionRollback — conceptual interface.
 * Phase 8: only safe, explicit rollbacks via ActionExecutor; else UNAVAILABLE.
 */
export interface ActionRollback {
  describe(plan: ActionPlan): ActionRollbackInfo;
  attempt(plan: ActionPlan): Promise<ActionResult>;
}

export class DefaultActionRollback implements ActionRollback {
  constructor(private readonly executor: ActionExecutor) {}

  describe(plan: ActionPlan): ActionRollbackInfo {
    return this.executor.rollbackInfo(plan);
  }

  async attempt(plan: ActionPlan): Promise<ActionResult> {
    if (plan.status !== "COMPLETED") {
      return {
        success: false,
        error: {
          code: ACTION_ERROR_CODES.INVALID_STATE,
          message: "Rollback only considered after COMPLETED",
        },
      };
    }
    return this.executor.rollback(plan);
  }
}
