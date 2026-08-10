import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { FileService } from "../files/FileService.js";

export function createFileCopyTool(
  files: FileService,
): Tool<Record<string, unknown>> {
  return {
    id: "file.copy",
    name: "File Copy",
    description: "Copy a file within allowed paths (MEDIUM — confirmation required).",
    riskLevel: RiskLevel.MEDIUM,

    validate(args) {
      if (typeof args.source !== "string" || args.source.trim() === "") {
        return "source (string) is required";
      }
      if (typeof args.destination !== "string" || args.destination.trim() === "") {
        return "destination (string) is required";
      }
      if (args.overwrite !== undefined && typeof args.overwrite !== "boolean") {
        return "overwrite must be a boolean";
      }
      if (args.dryRun !== undefined && typeof args.dryRun !== "boolean") {
        return "dryRun must be a boolean";
      }
      return null;
    },

    async execute(args): Promise<ToolResult> {
      const result = await files.copy({
        source: String(args.source),
        destination: String(args.destination),
        overwrite: args.overwrite === true,
        dryRun: args.dryRun === true,
        confirmed: true,
      });
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      return { ok: true, data: result.data };
    },
  };
}
