import type { RiskLevel } from "../permissions/RiskLevel.js";
import type { ToolResult } from "../core/types.js";

/**
 * Tool interface — every capability is a Tool.
 * Tools never bypass PermissionManager; only JarvisCore may call execute()
 * after permission checks.
 */
export interface Tool<TArgs = Record<string, unknown>, TData = unknown> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly riskLevel: RiskLevel;

  /** Optional argument validation. Return an error message or null if ok. */
  validate?(args: TArgs): string | null;

  execute(args: TArgs): Promise<ToolResult & { data?: TData }> | (ToolResult & { data?: TData });
}

export function isTool(value: unknown): value is Tool {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.name === "string" &&
    typeof t.description === "string" &&
    typeof t.riskLevel === "string" &&
    typeof t.execute === "function"
  );
}
