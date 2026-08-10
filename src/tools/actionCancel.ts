import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ActionService } from "../actions/ActionService.js";

export function createActionCancelTool(actions: ActionService): Tool {
  return {
    id: "action.cancel",
    name: "Action Cancel",
    description:
      "Cancel a planned action before EXECUTING (never interrupts mid-flight).",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (!args || typeof args !== "object") return "arguments required";
      if (typeof args.taskId !== "string" || !args.taskId) {
        return "taskId required";
      }
      return null;
    },
    async execute(args): Promise<ToolResult> {
      const result = actions.cancel(args.taskId as string);
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
