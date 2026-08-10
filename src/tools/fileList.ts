import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { FileService } from "../files/FileService.js";
import type { FileListEntry } from "../files/types.js";

function asString(value: unknown, name: string): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

export function createFileListTool(
  files: FileService,
): Tool<Record<string, unknown>, { path: string; entries: FileListEntry[] }> {
  return {
    id: "file.list",
    name: "File List",
    description: "List entries in an allowed directory (metadata only, non-recursive by default).",
    riskLevel: RiskLevel.LOW,

    validate(args) {
      if (!asString(args.path, "path")) return "path (string) is required";
      if (args.recursive !== undefined && typeof args.recursive !== "boolean") {
        return "recursive must be a boolean";
      }
      if (args.maxDepth !== undefined && typeof args.maxDepth !== "number") {
        return "maxDepth must be a number";
      }
      return null;
    },

    async execute(args): Promise<ToolResult & { data?: { path: string; entries: FileListEntry[] } }> {
      const result = await files.list({
        path: String(args.path),
        recursive: args.recursive === true,
        maxDepth: typeof args.maxDepth === "number" ? args.maxDepth : undefined,
      });
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      return { ok: true, data: result.data };
    },
  };
}
