import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ApplicationService } from "../applications/ApplicationService.js";

export function createApplicationListTool(
  apps: ApplicationService,
): Tool<Record<string, unknown>> {
  return {
    id: "application.list",
    name: "Application List",
    description:
      "List applications from the controlled registry (name, bundleId, path, running).",
    riskLevel: RiskLevel.LOW,

    validate(args) {
      if (args && Object.keys(args).length > 0) {
        return "application.list accepts no arguments";
      }
      return null;
    },

    async execute(): Promise<ToolResult> {
      const result = await apps.list();
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      return { ok: true, data: result.data };
    },
  };
}
