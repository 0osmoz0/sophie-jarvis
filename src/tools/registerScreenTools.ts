import type { ScreenService } from "../screen/ScreenService.js";
import type { ToolRegistry } from "./ToolRegistry.js";
import { createScreenInfoTool } from "./screenInfo.js";
import { createScreenWindowsTool } from "./screenWindows.js";
import { createScreenActiveWindowTool } from "./screenActiveWindow.js";
import { createScreenSessionTool } from "./screenSession.js";
import { createScreenCaptureTool } from "./screenCapture.js";

/** Register Phase 6 screen observation tools. */
export function registerScreenTools(
  registry: ToolRegistry,
  screens: ScreenService,
): void {
  registry.register(createScreenInfoTool(screens));
  registry.register(createScreenWindowsTool(screens));
  registry.register(createScreenActiveWindowTool(screens));
  registry.register(createScreenSessionTool(screens));
  registry.register(createScreenCaptureTool(screens));
}
