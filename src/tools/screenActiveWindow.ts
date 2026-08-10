import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ScreenService } from "../screen/ScreenService.js";

export function createScreenActiveWindowTool(
  screens: ScreenService,
): Tool<Record<string, unknown>> {
  return {
    id: "screen.activeWindow",
    name: "Screen Active Window",
    description: "Return the active window metadata when available.",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (args && Object.keys(args).length > 0) {
        return "screen.activeWindow accepts no arguments";
      }
      return null;
    },
    async execute(): Promise<ToolResult> {
      const result = await screens.activeWindow();
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      return { ok: true, data: result.data };
    },
  };
}
