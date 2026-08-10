import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ScreenService } from "../screen/ScreenService.js";

export function createScreenInfoTool(screens: ScreenService): Tool<Record<string, unknown>> {
  return {
    id: "screen.info",
    name: "Screen Info",
    description: "Return display geometry (count, dimensions, primary). No screenshot.",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (args && Object.keys(args).length > 0) return "screen.info accepts no arguments";
      return null;
    },
    async execute(): Promise<ToolResult> {
      const result = await screens.info();
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      return { ok: true, data: result.data };
    },
  };
}
