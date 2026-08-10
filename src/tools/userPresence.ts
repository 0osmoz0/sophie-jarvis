import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { UserActivityService } from "../presence/UserActivityService.js";

export function createUserPresenceTool(
  activity: UserActivityService,
): Tool<Record<string, unknown>> {
  return {
    id: "user.presence",
    name: "User Presence",
    description:
      "Software presence indicator from aggregate activity. IDLE does not prove physical absence.",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (args && Object.keys(args).length > 0) {
        return "user.presence accepts no arguments";
      }
      return null;
    },
    async execute(): Promise<ToolResult> {
      const result = await activity.getPresence();
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      return {
        ok: true,
        data: {
          presence: result.data.presence,
          confidence: result.data.confidence,
          reason: result.data.reason,
        },
      };
    },
  };
}
