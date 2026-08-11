/**
 * Correlates signals into an explainable ThreatAssessment.
 * Conservative: prefers unknown over false accusation. Never claims malware.
 */
import type {
  SecurityPresenceBucket,
  SecuritySeverity,
  SecuritySignal,
  ThreatAssessment,
} from "./types.js";
import { SECURITY_DISCLAIMER, SEVERITY_ORDER } from "./types.js";

const CORRELATION_WINDOW_MS = 15 * 60 * 1000;

export interface SecuritySequence {
  id: string;
  kinds: string[];
  windowMs: number;
  startedAt: number;
  endedAt: number;
}

export class ThreatAssessmentEngine {
  assess(
    signals: SecuritySignal[],
    presence: SecurityPresenceBucket,
    now: number = Date.now(),
  ): ThreatAssessment {
    const recent = signals.filter(
      (s) => now - s.timestamp <= CORRELATION_WINDOW_MS,
    );
    const sequence = buildSequence(recent);
    const { level, confidence, reasons } = score(recent, presence, sequence);

    const evidence = recent.flatMap((s) => s.evidence).slice(0, 24);
    return {
      level,
      confidence,
      reasons,
      evidence,
      signals: recent,
      presence,
      requiresUserAttention: SEVERITY_ORDER[level] >= SEVERITY_ORDER.MEDIUM,
      disclaimer: SECURITY_DISCLAIMER,
    };
  }
}

function buildSequence(signals: SecuritySignal[]): SecuritySequence | null {
  if (signals.length === 0) return null;
  const sorted = [...signals].sort((a, b) => a.timestamp - b.timestamp);
  return {
    id: `seq_${sorted[0]!.timestamp}`,
    kinds: sorted.map((s) => s.kind),
    windowMs: CORRELATION_WINDOW_MS,
    startedAt: sorted[0]!.timestamp,
    endedAt: sorted[sorted.length - 1]!.timestamp,
  };
}

function score(
  signals: SecuritySignal[],
  presence: SecurityPresenceBucket,
  sequence: SecuritySequence | null,
): { level: SecuritySeverity; confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  let confidence = 0.25;

  const kinds = new Set(signals.map((s) => s.kind));
  const idleish =
    presence === "IDLE" ||
    presence === "LONG_IDLE" ||
    presence === "RECENTLY_IDLE";

  const newApp = [...kinds].some((k) =>
    [
      "application_started",
      "unknown_application",
      "NEW_APPLICATION",
      "UNUSUAL_APPLICATION",
    ].includes(k),
  );
  const unexpectedApp =
    kinds.has("unexpected_application") ||
    kinds.has("UNUSUAL_APPLICATION") ||
    kinds.has("UNEXPECTED_APPLICATION_RETURN");
  const frontmost = [...kinds].some((k) =>
    [
      "application_became_frontmost",
      "new_frontmost_application",
      "FRONTMOST_CHANGE",
    ].includes(k),
  );
  const fileChange = [...kinds].some((k) =>
    [
      "new_file",
      "modified_file",
      "deleted_file",
      "unexpected_extension",
      "UNUSUAL_FILE_ACTIVITY",
    ].includes(k),
  );
  const systemOdd = [...kinds].some((k) =>
    ["memory_pressure_unusual", "uptime_reset"].includes(k),
  );
  const unknownApp =
    kinds.has("unknown_application") || kinds.has("UNUSUAL_APPLICATION");

  // System-only anomalies almost never become HIGH
  const onlySystem =
    systemOdd &&
    !newApp &&
    !unexpectedApp &&
    !frontmost &&
    !fileChange;

  // Isolated benign activity stays INFO
  if (signals.length <= 1 && !unexpectedApp && !systemOdd) {
    reasons.push("Only isolated or routine indicators were observed.");
    return { level: "INFO", confidence: 0.3, reasons };
  }

  if (idleish && newApp) {
    score += unknownApp ? 1.2 : 0.6;
    confidence += unknownApp ? 0.15 : 0.08;
    reasons.push(
      idleish
        ? "A new application appeared while idle indicators were elevated."
        : "A new application appeared.",
    );
  }

  if (idleish && unexpectedApp) {
    score += 1.5;
    confidence += 0.18;
    reasons.push(
      "An unfamiliar application became active while the user may have been inactive.",
    );
  }

  if (idleish && frontmost && newApp) {
    score += 0.8;
    confidence += 0.1;
    reasons.push(
      "Frontmost application changed in combination with a new application during idle.",
    );
  }

  if (idleish && fileChange) {
    score += 1.0;
    confidence += 0.12;
    reasons.push(
      "Watched-file metadata changed while idle indicators were elevated.",
    );
  }

  if (systemOdd) {
    score += kinds.has("uptime_reset") ? 1.4 : 0.5;
    confidence += 0.1;
    reasons.push("A system-level unusual indicator was observed.");
  }

  if (onlySystem) {
    score = Math.min(score, 1.0);
    confidence = Math.min(confidence, 0.45);
    reasons.push(
      "System variation alone is insufficient for high severity — kept conservative.",
    );
  }

  // Strong correlation sequence
  if (
    sequence &&
    idleish &&
    newApp &&
    frontmost &&
    fileChange
  ) {
    score += 1.2;
    confidence += 0.15;
    reasons.push(
      "Correlated sequence: idle → application change → frontmost change → file change.",
    );
  }

  // Cap false positives: known-benign only paths
  const onlyBenignApp =
    newApp &&
    !unknownApp &&
    !kinds.has("unexpected_application") &&
    !fileChange &&
    !systemOdd;
  if (onlyBenignApp) {
    score = Math.min(score, 0.8);
    confidence = Math.min(confidence, 0.4);
    reasons.push(
      "Application change matches common benign apps — kept at low concern.",
    );
  }

  if (presence === "UNKNOWN") {
    confidence = Math.min(confidence, 0.45);
    reasons.push("Presence is unknown — confidence limited.");
  }

  confidence = Math.max(0.15, Math.min(0.85, confidence));

  let level: SecuritySeverity = "INFO";
  if (score >= 4.5) level = "HIGH";
  else if (score >= 2.8) level = "MEDIUM";
  else if (score >= 1.2) level = "LOW";
  else level = "INFO";

  if (onlySystem && SEVERITY_ORDER[level] > SEVERITY_ORDER.LOW) {
    level = "LOW";
  }

  // Never auto-escalate isolated Spotify/Chrome to HIGH/CRITICAL
  if (onlyBenignApp && level !== "INFO") {
    level = "LOW";
  }

  // CRITICAL reserved for extreme correlated cases — still alert-only
  if (
    score >= 6 &&
    idleish &&
    unexpectedApp &&
    fileChange &&
    systemOdd
  ) {
    level = "CRITICAL";
    confidence = Math.min(0.8, confidence + 0.05);
    reasons.push(
      "Multiple independent unusual signals correlated — highest alert severity (no action taken).",
    );
  }

  if (reasons.length === 0) {
    reasons.push("No strong unusual pattern was identified.");
  }

  return { level, confidence, reasons };
}
