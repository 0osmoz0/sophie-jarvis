import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { IntentRouter } from "../ai/IntentRouter.js";

/**
 * intent.understand — LOW.
 * Returns validated understanding only. Never executes actions.
 */
export function createIntentUnderstandTool(router: IntentRouter): Tool {
  return {
    id: "intent.understand",
    name: "Intent Understand",
    description:
      "Parse natural language into a validated structured intent. Never executes.",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (!args || typeof args !== "object") return "arguments required";
      if (typeof args.text !== "string") return "text must be a string";
      return null;
    },
    async execute(args): Promise<ToolResult> {
      const outcome = await router.understand(args.text as string);
      return { ok: true, data: outcome };
    },
  };
}
