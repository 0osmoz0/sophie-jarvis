/**
 * Risk levels for tool execution.
 *
 * LOW      → may run automatically
 * MEDIUM   → user confirmation required
 * HIGH     → explicit confirmation required
 * CRITICAL → never executed automatically
 *
 * Architecture is designed so these rules can be strengthened later
 * (e.g. allowlists, dual confirmation, audit trails).
 */
export enum RiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

/** Ordered severity for comparisons (higher = more dangerous). */
export const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  [RiskLevel.LOW]: 0,
  [RiskLevel.MEDIUM]: 1,
  [RiskLevel.HIGH]: 2,
  [RiskLevel.CRITICAL]: 3,
};

export function isRiskLevel(value: unknown): value is RiskLevel {
  return (
    typeof value === "string" &&
    Object.values(RiskLevel).includes(value as RiskLevel)
  );
}

export function compareRiskLevel(a: RiskLevel, b: RiskLevel): number {
  return RISK_LEVEL_ORDER[a] - RISK_LEVEL_ORDER[b];
}
