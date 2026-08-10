import type { ApplicationService } from "../applications/ApplicationService.js";
import type { ToolRegistry } from "./ToolRegistry.js";
import { createApplicationListTool } from "./applicationList.js";
import { createApplicationInfoTool } from "./applicationInfo.js";
import { createApplicationActiveTool } from "./applicationActive.js";
import { createApplicationOpenTool } from "./applicationOpen.js";
import { createApplicationCloseTool } from "./applicationClose.js";

/** Register all Phase 4 application lifecycle tools. */
export function registerApplicationTools(
  registry: ToolRegistry,
  apps: ApplicationService,
): void {
  registry.register(createApplicationListTool(apps));
  registry.register(createApplicationInfoTool(apps));
  registry.register(createApplicationActiveTool(apps));
  registry.register(createApplicationOpenTool(apps));
  registry.register(createApplicationCloseTool(apps));
}
