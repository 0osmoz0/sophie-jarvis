import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ApplicationService } from "../applications/ApplicationService.js";

export function createApplicationActiveTool(
  apps: ApplicationService,
): Tool<Record<string, unknown>> {
  return {
    id: "application.active",
    name: "Application Active",
    description:
      "Return the frontmost application when available (may be unavailable without Accessibility).",
    riskLevel: RiskLevel.LOW,

    validate(args) {
      if (args && Object.keys(args).length > 0) {
        return "application.active accepts no arguments";
      }
      return null;
    },

    async execute(): Promise<ToolResult> {
      const result = await apps.active();
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      return { ok: true, data: result.data };
    },
  };
}
