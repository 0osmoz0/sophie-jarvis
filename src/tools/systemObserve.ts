import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ObservationService } from "../observation/ObservationService.js";
import type { ObservationSnapshot } from "../observation/types.js";

/**
 * system.observe — LOW risk, READ ONLY.
 * Returns an ObservationSnapshot via ObservationService.
 * Must always go through JarvisCore → PermissionManager.
 */
export function createSystemObserveTool(
  observationService: ObservationService,
): Tool<Record<string, unknown>, ObservationSnapshot> {
  return {
    id: "system.observe",
    name: "System Observe",
    description:
      "Returns a read-only ObservationSnapshot of the host (no system mutation).",
    riskLevel: RiskLevel.LOW,

    validate(args: Record<string, unknown>): string | null {
      if (args && Object.keys(args).length > 0) {
        return "system.observe accepts no arguments";
      }
      return null;
    },

    async execute(
      _args: Record<string, unknown>,
    ): Promise<ToolResult & { data: ObservationSnapshot }> {
      const data = await observationService.snapshot();
      return { ok: true, data };
    },
  };
}
