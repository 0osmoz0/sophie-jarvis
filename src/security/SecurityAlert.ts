/**
 * Human-readable security alerts — explain, never accuse malware.
 */
import type {
  SecurityAlert,
  SecuritySeverity,
  ThreatAssessment,
} from "./types.js";

let alertSeq = 0;

export function alertsFromAssessment(
  assessment: ThreatAssessment,
  timestamp: number = Date.now(),
): SecurityAlert[] {
  if (assessment.level === "INFO" && assessment.confidence < 0.4) {
    return [];
  }
  // Always produce an alert object when level >= LOW or attention required
  if (
    assessment.level === "INFO" &&
    !assessment.requiresUserAttention &&
    assessment.signals.every((s) => s.severity === "INFO")
  ) {
    // Soft informational alert only if there is something beyond pure presence
    const interesting = assessment.signals.some(
      (s) =>
        s.category !== "USER_PRESENCE" ||
        s.kind === "user_long_idle",
    );
    if (!interesting) return [];
  }

  alertSeq += 1;
  const { title, summary } = copyForLevel(assessment.level);
  const category =
    assessment.signals.find((s) => s.category !== "USER_PRESENCE")?.category ??
    "CORRELATED";

  return [
    {
      id: `alert_${timestamp}_${alertSeq}`,
      level: assessment.level,
      confidence: assessment.confidence,
      title,
      summary: buildSummary(assessment, summary),
      reasons: assessment.reasons,
      evidence: assessment.evidence,
      timestamp,
      requiresUserAttention: assessment.requiresUserAttention,
      category,
    },
  ];
}

export function formatAlertMessage(alert: SecurityAlert & {
  firstSeen?: number;
  lastSeen?: number;
  occurrences?: number;
}): string {
  const lines = [
    alert.title,
    "",
    alert.summary,
    "",
    `Niveau : ${alert.level}`,
    `Confiance : ${alert.confidence.toFixed(2)}`,
  ];
  if (alert.occurrences != null && alert.occurrences > 1) {
    lines.push(`Occurrences : ${alert.occurrences}`);
  }
  lines.push("", "Raisons :", ...alert.reasons.map((r) => `• ${r}`));
  if (alert.evidence.length) {
    lines.push("", "Indices :");
    for (const e of alert.evidence.slice(0, 12)) {
      lines.push(`• ${e.key}: ${e.value}`);
    }
  }
  lines.push("", "Aucune action n'a été prise.");
  lines.push(
    "Ceci n'est pas une confirmation de virus, malware ou intrusion.",
  );
  return lines.join("\n");
}

function copyForLevel(level: SecuritySeverity): {
  title: string;
  summary: string;
} {
  switch (level) {
    case "CRITICAL":
      return {
        title: "Potentially suspicious activity",
        summary:
          "Several unusual events were correlated. JARVIS cannot confirm malicious activity.",
      };
    case "HIGH":
      return {
        title: "Potentially suspicious activity",
        summary:
          "Several unusual events occurred. Review recommended. No action was taken.",
      };
    case "MEDIUM":
      return {
        title: "This deserves your attention",
        summary:
          "Unusual patterns were observed. This may be benign — confidence is limited.",
      };
    case "LOW":
      return {
        title: "Something unusual happened",
        summary: "A mild anomaly was detected relative to the recent baseline.",
      };
    default:
      return {
        title: "Informational security note",
        summary: "Minor or routine indicators were observed.",
      };
  }
}

function buildSummary(assessment: ThreatAssessment, base: string): string {
  const bits: string[] = [base];
  if (assessment.presence === "LONG_IDLE" || assessment.presence === "IDLE") {
    bits.push(
      `Presence bucket: ${assessment.presence} (not physical absence proof).`,
    );
  }
  return bits.join(" ");
}
