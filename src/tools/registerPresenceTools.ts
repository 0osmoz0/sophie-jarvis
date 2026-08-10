import type { UserActivityService } from "../presence/UserActivityService.js";
import type { ToolRegistry } from "./ToolRegistry.js";
import { createUserActivityTool } from "./userActivity.js";
import { createUserPresenceTool } from "./userPresence.js";

export function registerPresenceTools(
  registry: ToolRegistry,
  activity: UserActivityService,
): void {
  registry.register(createUserActivityTool(activity));
  registry.register(createUserPresenceTool(activity));
}
