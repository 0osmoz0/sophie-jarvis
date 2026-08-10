import os from "node:os";
import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";

/** Application version — kept in sync with package.json manually for Phase 1. */
export const JARVIS_APP_VERSION = "0.1.0";

export interface SystemInfoData {
  platform: string;
  arch: string;
  hostname: string | null;
  jarvisVersion: string;
  timestamp: string;
}

/**
 * system.info — the only real tool in Phase 1.
 *
 * Uses Node.js `os` module only (no shell, exec, spawn, or arbitrary FS).
 * Risk: LOW — read-only, non-sensitive metadata.
 */
export const systemInfoTool: Tool<Record<string, unknown>, SystemInfoData> = {
  id: "system.info",
  name: "System Info",
  description:
    "Returns harmless host metadata: OS, architecture, hostname, JARVIS version, timestamp.",
  riskLevel: RiskLevel.LOW,

  validate(args: Record<string, unknown>): string | null {
    if (args && Object.keys(args).length > 0) {
      return "system.info accepts no arguments";
    }
    return null;
  },

  execute(_args: Record<string, unknown>): ToolResult & { data: SystemInfoData } {
    let hostname: string | null = null;
    try {
      hostname = os.hostname() || null;
    } catch {
      hostname = null;
    }

    const data: SystemInfoData = {
      platform: os.platform(),
      arch: os.arch(),
      hostname,
      jarvisVersion: JARVIS_APP_VERSION,
      timestamp: new Date().toISOString(),
    };

    return { ok: true, data };
  },
};
