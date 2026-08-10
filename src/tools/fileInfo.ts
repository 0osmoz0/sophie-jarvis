import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { FileService } from "../files/FileService.js";
import type { FileInfoData } from "../files/types.js";

export function createFileInfoTool(
  files: FileService,
): Tool<Record<string, unknown>, FileInfoData> {
  return {
    id: "file.info",
    name: "File Info",
    description: "Return metadata for an allowed path (never reads file contents).",
    riskLevel: RiskLevel.LOW,

    validate(args) {
      if (typeof args.path !== "string" || args.path.trim() === "") {
        return "path (string) is required";
      }
      return null;
    },

    async execute(args): Promise<ToolResult & { data?: FileInfoData }> {
      const result = await files.info({ path: String(args.path) });
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      return { ok: true, data: result.data };
    },
  };
}
