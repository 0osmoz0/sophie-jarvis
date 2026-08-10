import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ActionService } from "../actions/ActionService.js";
import type { ActionConfirmationToken } from "../actions/types.js";
import { isActionType } from "../actions/types.js";

export function createActionConfirmTool(actions: ActionService): Tool {
  return {
    id: "action.confirm",
    name: "Action Confirm",
    description:
      "Confirm a planned typed action (bound to taskId + action + payload).",
    riskLevel: RiskLevel.MEDIUM,
    validate(args) {
      if (!args || typeof args !== "object") return "arguments required";
      if (typeof args.taskId !== "string" || !args.taskId) {
        return "taskId required";
      }
      if (args.issue === true) return null;
      if (!args.token || typeof args.token !== "object") {
        return "token object required (or issue:true to request confirmation)";
      }
      const t = args.token as Record<string, unknown>;
      if (typeof t.taskId !== "string") return "token.taskId required";
      if (!isActionType(t.actionType)) return "token.actionType invalid";
      if (typeof t.payloadHash !== "string") return "token.payloadHash required";
      if (typeof t.expiresAt !== "number") return "token.expiresAt required";
      return null;
    },
    async execute(args): Promise<ToolResult> {
      const taskId = args.taskId as string;
      if (args.issue === true) {
        const issued = actions.requestConfirmation(taskId);
        if (!issued.success) {
          return {
            ok: false,
            error: `${issued.error?.code}: ${issued.error?.message}`,
          };
        }
        return { ok: true, data: issued.data };
      }

      const token = args.token as ActionConfirmationToken;
      const result = actions.confirm(taskId, token);
      if (!result.success) {
        return {
          ok: false,
          error: `${result.error?.code}: ${result.error?.message}`,
        };
      }
      return { ok: true, data: result.data };
    },
  };
}
