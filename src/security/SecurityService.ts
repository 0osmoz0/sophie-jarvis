/**
 * SecurityService — DETECTION / ANALYZE ONLY façade.
 * Must not import ActionExecutor, FileService, ApplicationService, PermissionManager.
 */
import { SecurityBaseline } from "./SecurityBaseline.js";
import { SecuritySignalCollector } from "./SecuritySignalCollector.js";
import { ThreatAssessmentEngine } from "./ThreatAssessmentEngine.js";
import { alertsFromAssessment, formatAlertMessage } from "./SecurityAlert.js";
import { MemorySecurityAuditLog } from "./SecurityAuditLog.js";
import type {
  SecurityAlert,
  SecurityAssessResult,
  SecurityAuditSink,
  SecurityObservationInput,
  SecurityServiceStatus,
  SecuritySeverity,
  SecurityTiming,
  ThreatAssessment,
} from "./types.js";
import { SEVERITY_ORDER, SECURITY_DISCLAIMER } from "./types.js";

const MAX_ALERT_HISTORY = 32;
const MAX_SIGNAL_HISTORY = 128;

export interface SecurityAssessOptions {
  /** When false, do not soft-update baseline (monitor controls absorb). Default true. */
  updateBaseline?: boolean;
  /** Soft-update only if assessment level ≤ this (monitor use). */
  baselineAbsorbMaxLevel?: SecuritySeverity;
  /** Skip onAlert callback (monitor handles deduped emission). Default false. */
  suppressOnAlert?: boolean;
}

export interface SecurityServiceOptions {
  audit?: SecurityAuditSink;
  now?: () => number;
  /** Optional outbound notifier (e.g. Sophie) — alert metadata only. */
  onAlert?: (alert: SecurityAlert) => void;
}

export class SecurityService {
  readonly baseline = new SecurityBaseline();
  private readonly collector = new SecuritySignalCollector();
  private readonly engine = new ThreatAssessmentEngine();
  private readonly audit: SecurityAuditSink;
  private readonly now: () => number;
  private readonly onAlert: ((alert: SecurityAlert) => void) | undefined;
  private readonly alertHistory: SecurityAlert[] = [];
  private readonly signalHistory: SecurityAssessResult["signals"] = [];
  private lastAssessment: ThreatAssessment | null = null;

  constructor(options: SecurityServiceOptions = {}) {
    this.audit = options.audit ?? new MemorySecurityAuditLog();
    this.now = options.now ?? (() => Date.now());
    this.onAlert = options.onAlert;
  }

  /** Establish or refresh baseline from observation (no sensitive payloads). */
  seedBaseline(obs: SecurityObservationInput): void {
    const t0 = this.now();
    this.baseline.updateFromObservation(obs);
    this.audit.append({
      timestamp: new Date(this.now()).toISOString(),
      toolId: "security.baseline",
      action: "baseline",
      signalCount: 0,
      alertCount: 0,
      level: null,
      result: "success",
      latencyMs: this.now() - t0,
    });
  }

  status(): SecurityServiceStatus {
    return {
      baselineReady: this.baseline.isReady(),
      baselineAgeMs: this.baseline.ageMs(this.now()),
      signalCount: this.signalHistory.length,
      alertCount: this.alertHistory.length,
      lastAssessment: this.lastAssessment,
      mode: "DETECTION_ONLY",
    };
  }

  alerts(): SecurityAlert[] {
    return this.alertHistory.map((a) => ({
      ...a,
      evidence: [...a.evidence],
      reasons: [...a.reasons],
    }));
  }

  /**
   * Compare observation to baseline → signals → assessment → alerts.
   * Never mutates the system.
   */
  assess(
    obs: SecurityObservationInput,
    options: SecurityAssessOptions = {},
  ): SecurityAssessResult {
    const updateBaseline = options.updateBaseline !== false;
    const suppressOnAlert = options.suppressOnAlert === true;
    const totalStart = this.now();
    const timing: SecurityTiming = {
      signalCollectionMs: 0,
      baselineMs: 0,
      assessmentMs: 0,
      correlationMs: 0,
      alertFormattingMs: 0,
      totalSecurityMs: 0,
    };

    const b0 = this.now();
    if (!this.baseline.isReady()) {
      this.baseline.updateFromObservation(obs);
      timing.baselineMs = this.now() - b0;
      const empty: SecurityAssessResult = {
        assessment: {
          level: "INFO",
          confidence: 0.2,
          reasons: [
            "Baseline established — insufficient history for anomalies.",
          ],
          evidence: [],
          signals: [],
          presence: "UNKNOWN",
          requiresUserAttention: false,
          disclaimer: SECURITY_DISCLAIMER,
        },
        alerts: [],
        signals: [],
        timing: {
          ...timing,
          totalSecurityMs: this.now() - totalStart,
        },
      };
      this.lastAssessment = empty.assessment;
      this.audit.append({
        timestamp: new Date(this.now()).toISOString(),
        toolId: "security.assess",
        action: "assess",
        signalCount: 0,
        alertCount: 0,
        level: "INFO",
        result: "success",
        latencyMs: empty.timing.totalSecurityMs,
      });
      return empty;
    }
    timing.baselineMs = this.now() - b0;

    const s0 = this.now();
    const { signals, presence } = this.collector.collect(obs, this.baseline);
    timing.signalCollectionMs = this.now() - s0;

    const a0 = this.now();
    const assessment = this.engine.assess(signals, presence, obs.timestamp);
    timing.assessmentMs = this.now() - a0;
    timing.correlationMs = timing.assessmentMs;

    const f0 = this.now();
    const alerts = alertsFromAssessment(assessment, obs.timestamp);
    timing.alertFormattingMs = this.now() - f0;

    for (const sig of signals) {
      this.signalHistory.push(sig);
    }
    while (this.signalHistory.length > MAX_SIGNAL_HISTORY) {
      this.signalHistory.shift();
    }
    for (const alert of alerts) {
      this.alertHistory.push(alert);
      if (!suppressOnAlert) {
        this.onAlert?.(alert);
      }
    }
    while (this.alertHistory.length > MAX_ALERT_HISTORY) {
      this.alertHistory.shift();
    }

    if (updateBaseline) {
      const maxLevel = options.baselineAbsorbMaxLevel;
      const mayAbsorb =
        maxLevel == null ||
        SEVERITY_ORDER[assessment.level] <= SEVERITY_ORDER[maxLevel];
      if (mayAbsorb) {
        this.baseline.updateFromObservation(obs);
      } else {
        // Still learn habitual frequency without replacing anomalous snapshot
        this.baseline.learnHabits(obs);
      }
    }

    this.lastAssessment = assessment;
    timing.totalSecurityMs = this.now() - totalStart;

    this.audit.append({
      timestamp: new Date(this.now()).toISOString(),
      toolId: "security.assess",
      action: "assess",
      signalCount: signals.length,
      alertCount: alerts.length,
      level: assessment.level,
      result: "success",
      latencyMs: timing.totalSecurityMs,
    });

    return { assessment, alerts, signals, timing };
  }

  formatLastAlert(): string | null {
    const last = this.alertHistory[this.alertHistory.length - 1];
    return last ? formatAlertMessage(last) : null;
  }

  clearHistory(): void {
    this.alertHistory.length = 0;
    this.signalHistory.length = 0;
    this.lastAssessment = null;
    this.baseline.clear();
  }
}

export { formatAlertMessage };
