import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ActionService } from "../actions/ActionService.js";
import { isActionType } from "../actions/types.js";

export function createActionPlanTool(actions: ActionService): Tool {
  return {
    id: "action.plan",
    name: "Action Plan",
    description:
      "Plan a typed controlled action (never an arbitrary shell command).",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (!args || typeof args !== "object") return "arguments required";
      if (!isActionType(args.type)) return "type must be a known ActionType";
      if (
        !args.payload ||
        typeof args.payload !== "object" ||
        Array.isArray(args.payload)
      ) {
        return "payload must be a plain object";
      }
      return null;
    },
    async execute(args): Promise<ToolResult> {
      const result = actions.plan(
        {
          type: args.type as Parameters<ActionService["plan"]>[0]["type"],
          payload: args.payload as Record<string, unknown>,
        },
        { dryRun: args.dryRun === true },
      );
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
