import type { IntentRouter } from "../ai/IntentRouter.js";
import type { ToolRegistry } from "./ToolRegistry.js";
import { createIntentUnderstandTool } from "./intentUnderstand.js";
import { createIntentPlanTool } from "./intentPlan.js";

export function registerIntentTools(
  registry: ToolRegistry,
  router: IntentRouter,
): void {
  registry.register(createIntentUnderstandTool(router));
  registry.register(createIntentPlanTool(router));
}
