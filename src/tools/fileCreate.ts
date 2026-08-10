import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { FileService } from "../files/FileService.js";

export function createFileCreateTool(
  files: FileService,
): Tool<Record<string, unknown>> {
  return {
    id: "file.create",
    name: "File Create",
    description:
      "Create a simple text file in an allowed path (MEDIUM — confirmation required).",
    riskLevel: RiskLevel.MEDIUM,

    validate(args) {
      if (typeof args.path !== "string" || args.path.trim() === "") {
        return "path (string) is required";
      }
      if (args.content !== undefined && typeof args.content !== "string") {
        return "content must be a string when provided";
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
      const result = await files.create({
        path: String(args.path),
        content: typeof args.content === "string" ? args.content : "",
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
