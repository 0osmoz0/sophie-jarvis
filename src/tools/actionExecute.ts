import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ActionService } from "../actions/ActionService.js";

/**
 * action.execute — HIGH at the tool gate (mutations).
 * ActionService still enforces typed plan + ActionConfirmation binding.
 */
export function createActionExecuteTool(actions: ActionService): Tool {
  return {
    id: "action.execute",
    name: "Action Execute",
    description:
      "Execute an approved typed ActionPlan via FileService/ApplicationService only.",
    riskLevel: RiskLevel.HIGH,
    validate(args) {
      if (!args || typeof args !== "object") return "arguments required";
      if (typeof args.taskId !== "string" || !args.taskId) {
        return "taskId required";
      }
      if (args.dryRun !== undefined && typeof args.dryRun !== "boolean") {
        return "dryRun must be boolean";
      }
      return null;
    },
    async execute(args): Promise<ToolResult> {
      const result = await actions.execute(args.taskId as string, {
        dryRun: args.dryRun === true,
      });
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
