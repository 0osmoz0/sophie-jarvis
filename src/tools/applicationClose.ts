import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ApplicationService } from "../applications/ApplicationService.js";

export function createApplicationCloseTool(
  apps: ApplicationService,
): Tool<Record<string, unknown>> {
  return {
    id: "application.close",
    name: "Application Close",
    description:
      "Gracefully close a registered application (MEDIUM — confirmation required). Never force-kills. Denylist system apps.",
    riskLevel: RiskLevel.MEDIUM,

    validate(args) {
      const has =
        (typeof args.name === "string" && args.name.trim() !== "") ||
        (typeof args.bundleId === "string" && args.bundleId.trim() !== "") ||
        (typeof args.path === "string" && args.path.trim() !== "") ||
        (typeof args.id === "string" && args.id.trim() !== "");
      if (!has) return "Provide name, bundleId, path, or id";
      return null;
    },

    async execute(args): Promise<ToolResult> {
      const result = await apps.close({
        name: typeof args.name === "string" ? args.name : undefined,
        bundleId: typeof args.bundleId === "string" ? args.bundleId : undefined,
        path: typeof args.path === "string" ? args.path : undefined,
        id: typeof args.id === "string" ? args.id : undefined,
        confirmed: true,
      });
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      return { ok: true, data: result.data };
    },
  };
}
