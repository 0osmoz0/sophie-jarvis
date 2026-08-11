import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { IntentRouter } from "../ai/IntentRouter.js";

/**
 * intent.plan — LOW.
 * Understand → ActionService.plan only. No execute / confirm bypass.
 */
export function createIntentPlanTool(router: IntentRouter): Tool {
  return {
    id: "intent.plan",
    name: "Intent Plan",
    description:
      "Understand text and create an ActionPlan via Phase 8 planner. Does not execute.",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (!args || typeof args !== "object") return "arguments required";
      if (typeof args.text !== "string") return "text must be a string";
      if (args.dryRun !== undefined && typeof args.dryRun !== "boolean") {
        return "dryRun must be boolean";
      }
      return null;
    },
    async execute(args): Promise<ToolResult> {
      const result = await router.planFromText(args.text as string, {
        dryRun: args.dryRun === true,
      });
      if (!result.ok) {
        return {
          ok: false,
          error: `${result.error.code}: ${result.error.message}`,
        };
      }
      return {
        ok: true,
        data: {
          outcome: result.outcome,
          plan: result.plan,
        },
      };
    },
  };
}
