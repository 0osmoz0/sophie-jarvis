import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ScreenService } from "../screen/ScreenService.js";

export function createScreenWindowsTool(
  screens: ScreenService,
): Tool<Record<string, unknown>> {
  return {
    id: "screen.windows",
    name: "Screen Windows",
    description:
      "List window metadata only (id, title, app, bounds). Never pixels or OCR.",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (args && Object.keys(args).length > 0) {
        return "screen.windows accepts no arguments";
      }
      return null;
    },
    async execute(): Promise<ToolResult> {
      const result = await screens.windows();
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      return { ok: true, data: result.data };
    },
  };
}
