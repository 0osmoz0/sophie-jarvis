import type { ActionService } from "../actions/ActionService.js";
import type { ToolRegistry } from "./ToolRegistry.js";
import { createActionPlanTool } from "./actionPlan.js";
import { createActionConfirmTool } from "./actionConfirm.js";
import { createActionExecuteTool } from "./actionExecute.js";
import { createActionCancelTool } from "./actionCancel.js";

export function registerActionTools(
  registry: ToolRegistry,
  actions: ActionService,
): void {
  registry.register(createActionPlanTool(actions));
  registry.register(createActionConfirmTool(actions));
  registry.register(createActionExecuteTool(actions));
  registry.register(createActionCancelTool(actions));
}
