import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ScreenService } from "../screen/ScreenService.js";

export function createScreenSessionTool(
  screens: ScreenService,
): Tool<Record<string, unknown>> {
  return {
    id: "screen.session",
    name: "Screen Session",
    description:
      "Return session lock / presence when available (null if unknown — never invented).",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (args && Object.keys(args).length > 0) {
        return "screen.session accepts no arguments";
      }
      return null;
    },
    async execute(): Promise<ToolResult> {
      const result = await screens.session();
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      return { ok: true, data: result.data };
    },
  };
}
