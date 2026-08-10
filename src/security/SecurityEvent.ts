/**
 * Security event types — scaffolding only for Phase 1.
 * No real monitoring, alerts, or enforcement beyond permission gating.
 */

export type SecurityEventSeverity = "info" | "warning" | "critical";

export interface SecurityEvent {
  id: string;
  type: string;
  severity: SecurityEventSeverity;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export function createSecurityEvent(
  type: string,
  severity: SecurityEventSeverity,
  message: string,
  metadata?: Record<string, unknown>,
): SecurityEvent {
  return {
    id: `sec_${Date.now()}`,
    type,
    severity,
    message,
    timestamp: new Date().toISOString(),
    metadata,
  };
}
