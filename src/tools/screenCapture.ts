import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ScreenService } from "../screen/ScreenService.js";

/**
 * screen.capture — HIGH risk, explicit only.
 * Returns in-memory image abstraction; does not save to disk or upload.
 * Tool result omits raw bytes from audit; data is returned to the caller only.
 */
export function createScreenCaptureTool(
  screens: ScreenService,
): Tool<Record<string, unknown>> {
  return {
    id: "screen.capture",
    name: "Screen Capture",
    description:
      "Explicit screenshot via approved native API when available (HIGH — confirmation required). Never automatic, never uploaded, never persisted by default.",
    riskLevel: RiskLevel.HIGH,
    validate(args) {
      if (args.displayId !== undefined && typeof args.displayId !== "string") {
        return "displayId must be a string when provided";
      }
      const allowed = new Set(["displayId"]);
      for (const key of Object.keys(args)) {
        if (!allowed.has(key)) return `Unknown argument: ${key}`;
      }
      return null;
    },
    async execute(args): Promise<ToolResult> {
      const result = await screens.capture({
        displayId:
          typeof args.displayId === "string" ? args.displayId : undefined,
        confirmed: true,
      });
      if (!result.success) {
        return { ok: false, error: `${result.error.code}: ${result.error.message}` };
      }
      // Return metadata + byteLength; keep data for caller without logging it elsewhere
      return {
        ok: true,
        data: {
          displayId: result.data.displayId ?? null,
          image: {
            format: result.data.image.format,
            width: result.data.image.width,
            height: result.data.image.height,
            byteLength: result.data.image.data.byteLength,
            data: result.data.image.data,
          },
        },
      };
    },
  };
}
