import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { FileService } from "../files/FileService.js";

export function createFileDeleteTool(
  files: FileService,
): Tool<Record<string, unknown>> {
  return {
    id: "file.delete",
    name: "File Delete",
    description:
      "Delete a single file in an allowed path (HIGH — explicit confirmation required). Never deletes directories.",
    riskLevel: RiskLevel.HIGH,

    validate(args) {
      if (typeof args.path !== "string" || args.path.trim() === "") {
        return "path (string) is required";
      }
      if (args.recursive !== undefined && typeof args.recursive !== "boolean") {
        return "recursive must be a boolean";
      }
      if (args.dryRun !== undefined && typeof args.dryRun !== "boolean") {
        return "dryRun must be a boolean";
      }
      return null;
    },

    async execute(args): Promise<ToolResult> {
      const result = await files.delete({
        path: String(args.path),
        recursive: args.recursive === true,
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
