import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { ContextService } from "../context/ContextService.js";
import type { ContextQueryKind } from "../context/types.js";
import { ContextFormatter } from "../context/ContextFormatter.js";

const QUERIES: readonly ContextQueryKind[] = [
  "system.context",
  "system.status",
  "application.status",
  "screen.status",
  "user.status",
];

export function createContextSnapshotTool(context: ContextService): Tool {
  const formatter = new ContextFormatter();
  return {
    id: "system.context",
    name: "System Context",
    description:
      "Read-only unified Mac context snapshot. Never invents unavailable data.",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (args && typeof args === "object" && "query" in args) {
        const q = (args as { query?: unknown }).query;
        if (q !== undefined && typeof q === "string" && !QUERIES.includes(q as ContextQueryKind)) {
          return "query must be a known context query kind";
        }
      }
      return null;
    },
    async execute(args): Promise<ToolResult> {
      const query =
        args && typeof args.query === "string"
          ? (args.query as ContextQueryKind)
          : "system.context";
      const result = await context.getSnapshot(query);
      return {
        ok: true,
        data: {
          query: result.query,
          snapshot: result.snapshot,
          timing: result.timing,
          message: formatter.format(result.snapshot, result.query),
        },
      };
    },
  };
}
