import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { UserActivityService } from "../presence/UserActivityService.js";

export function createUserActivityTool(
  activity: UserActivityService,
): Tool<Record<string, unknown>> {
  return {
    id: "user.activity",
    name: "User Activity",
    description:
      "Aggregate user activity status (ACTIVE/IDLE/…). Never records keys or mouse content.",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (args && Object.keys(args).length > 0) {
        return "user.activity accepts no arguments";
      }
      return null;
    },
    async execute(): Promise<ToolResult> {
      const result = await activity.getActivity();
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      return {
        ok: true,
        data: {
          status: result.data.status,
          idleSeconds: result.data.idleSeconds,
          source: result.data.source,
        },
      };
    },
  };
}
