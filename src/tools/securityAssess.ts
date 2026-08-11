import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { SecurityService } from "../security/SecurityService.js";
import type { SecurityObservationInput } from "../security/types.js";
import { formatAlertMessage } from "../security/SecurityAlert.js";
import type { SecurityMonitor } from "../security/SecurityMonitor.js";
import { formatMonitorStatus } from "../security/SecurityMonitor.js";

export function createSecurityStatusTool(security: SecurityService): Tool {
  return {
    id: "security.status",
    name: "Security Status",
    description: "Read-only security detection status (no actions).",
    riskLevel: RiskLevel.LOW,
    validate() {
      return null;
    },
    async execute(): Promise<ToolResult> {
      const status = security.status();
      return { ok: true, data: status };
    },
  };
}

export function createSecurityAlertsTool(security: SecurityService): Tool {
  return {
    id: "security.alerts",
    name: "Security Alerts",
    description: "List recent in-memory security alerts (detection only).",
    riskLevel: RiskLevel.LOW,
    validate() {
      return null;
    },
    async execute(): Promise<ToolResult> {
      const alerts = security.alerts();
      return {
        ok: true,
        data: {
          alerts,
          messages: alerts.map(formatAlertMessage),
        },
      };
    },
  };
}

export function createSecurityAssessTool(
  security: SecurityService,
  getObservation: () =>
    | Promise<SecurityObservationInput>
    | SecurityObservationInput,
): Tool {
  return {
    id: "security.assess",
    name: "Security Assess",
    description:
      "Compare current observation to baseline and produce anomaly alerts. Never mutates the system.",
    riskLevel: RiskLevel.LOW,
    validate() {
      return null;
    },
    async execute(): Promise<ToolResult> {
      const obs = await getObservation();
      const result = security.assess(obs);
      return {
        ok: true,
        data: {
          assessment: result.assessment,
          alerts: result.alerts,
          timing: result.timing,
          messages: result.alerts.map(formatAlertMessage),
          mode: "DETECTION_ONLY",
        },
      };
    },
  };
}

export function createSecurityMonitorStatusTool(monitor: SecurityMonitor): Tool {
  return {
    id: "security.monitor.status",
    name: "Security Monitor Status",
    description:
      "Read-only security monitor status (enabled, last tick, sources). No actions.",
    riskLevel: RiskLevel.LOW,
    validate() {
      return null;
    },
    async execute(): Promise<ToolResult> {
      const report = monitor.statusReport();
      return {
        ok: true,
        data: {
          report,
          message: formatMonitorStatus(report),
          mode: "MONITORING_ALERT_ONLY",
        },
      };
    },
  };
}
