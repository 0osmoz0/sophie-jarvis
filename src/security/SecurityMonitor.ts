/**
 * SecurityMonitor — controlled periodic observation → assess → alert.
 * MONITORING + CORRELATION + ALERTING ONLY.
 *
 * Must NOT import ActionExecutor, FileService, ApplicationService, PermissionManager.
 * Uses recursive setTimeout (never setInterval).
 */
import { SecurityService } from "./SecurityService.js";
import { SecurityAlertDeduper } from "./SecurityAlertDeduper.js";
import { SeverityStabilizer } from "./SeverityStabilizer.js";
import { SECURITY_DISCLAIMER } from "./types.js";
import type { SecuritySeverity, ThreatAssessment } from "./types.js";
import {
  DEFAULT_SECURITY_MONITOR_CONFIG,
  clampMonitorInterval,
  defaultSources,
  emptyTiming,
  type DedupedSecurityAlert,
  type SecurityMonitorConfig,
  type SecurityMonitorOptions,
  type SecurityMonitorRunStatus,
  type SecurityMonitorState,
  type SecurityMonitorStatusReport,
  type SecurityMonitorTickResult,
  type SecurityMonitorTiming,
  type SecuritySourceReport,
} from "./monitorTypes.js";

export class SecurityMonitor {
  private readonly security: SecurityService;
  private readonly getObservation: SecurityMonitorOptions["getObservation"];
  private readonly getSources: SecurityMonitorOptions["getSources"];
  private readonly now: () => number;
  private readonly onAlert: ((alert: DedupedSecurityAlert) => void) | undefined;
  private readonly scheduleFn: (
    fn: () => void,
    delayMs: number,
  ) => { cancel: () => void };

  private config: SecurityMonitorConfig;
  private state: SecurityMonitorState;
  private readonly deduper: SecurityAlertDeduper;
  private readonly stabilizer = new SeverityStabilizer();
  private assessing = false;
  private timer: { cancel: () => void } | null = null;
  private lastTiming: SecurityMonitorTiming | null = null;
  private lastSources: SecuritySourceReport = defaultSources();
  private lastRisk: SecuritySeverity | "NONE" = "NONE";
  private stopped = true;

  constructor(
    security: SecurityService,
    options: SecurityMonitorOptions,
  ) {
    this.security = security;
    this.getObservation = options.getObservation;
    this.getSources = options.getSources;
    this.now = options.now ?? (() => Date.now());
    this.onAlert = options.onAlert;
    this.scheduleFn =
      options.schedule ??
      ((fn, delayMs) => {
        const id = setTimeout(fn, delayMs);
        return { cancel: () => clearTimeout(id) };
      });

    this.config = {
      ...DEFAULT_SECURITY_MONITOR_CONFIG,
      ...options.config,
    };
    this.config.observationIntervalMs = clampMonitorInterval(
      this.config.observationIntervalMs,
      this.config.minObservationIntervalMs,
    );
    this.deduper = new SecurityAlertDeduper(
      this.config.alertCooldownMs,
      this.now,
    );
    this.state = {
      enabled: this.config.enabled,
      lastObservationAt: null,
      lastAssessmentAt: null,
      lastAlertAt: null,
      assessmentCount: 0,
      alertCount: 0,
      status: this.config.enabled ? "IDLE" : "DISABLED",
    };
  }

  getConfig(): SecurityMonitorConfig {
    return { ...this.config };
  }

  configure(partial: Partial<SecurityMonitorConfig>): void {
    this.config = {
      ...this.config,
      ...partial,
    };
    this.config.observationIntervalMs = clampMonitorInterval(
      this.config.observationIntervalMs,
      this.config.minObservationIntervalMs,
    );
    this.deduper.setCooldown(this.config.alertCooldownMs);
    this.state.enabled = this.config.enabled;
    if (!this.config.enabled) {
      this.state.status = "DISABLED";
    }
  }

  start(): void {
    if (!this.config.enabled) {
      this.state.status = "DISABLED";
      return;
    }
    this.stopped = false;
    this.state.enabled = true;
    this.state.status = "IDLE";
    this.armNext(0);
  }

  stop(): void {
    this.stopped = true;
    this.timer?.cancel();
    this.timer = null;
    this.state.enabled = false;
    this.state.status = "DISABLED";
  }

  isRunning(): boolean {
    return !this.stopped && this.config.enabled;
  }

  getState(): SecurityMonitorState {
    return { ...this.state };
  }

  statusReport(): SecurityMonitorStatusReport {
    return {
      monitor: this.getState(),
      config: this.getConfig(),
      currentRisk: this.lastRisk,
      sources: { ...this.lastSources },
      lastTiming: this.lastTiming ? { ...this.lastTiming } : null,
      mode: "MONITORING_ALERT_ONLY",
      disclaimer: SECURITY_DISCLAIMER,
    };
  }

  dedupedAlerts(): DedupedSecurityAlert[] {
    return this.deduper.list();
  }

  /**
   * Single tick — used by scheduler and tests. Never executes system actions.
   */
  async tick(): Promise<SecurityMonitorTickResult> {
    const timing = emptyTiming();
    const totalStart = this.now();

    if (!this.config.enabled) {
      this.state.status = "DISABLED";
      timing.totalMs = this.now() - totalStart;
      this.lastTiming = timing;
      return {
        status: "DISABLED",
        assessment: null,
        alerts: [],
        signals: [],
        emittedAlerts: [],
        skipped: true,
        skipReason: "disabled",
        timing,
      };
    }

    if (this.assessing) {
      timing.totalMs = this.now() - totalStart;
      this.lastTiming = timing;
      return {
        status: this.state.status,
        assessment: null,
        alerts: [],
        signals: [],
        emittedAlerts: [],
        skipped: true,
        skipReason: "concurrent_assessment",
        timing,
      };
    }

    const lastA = this.state.lastAssessmentAt;
    if (
      lastA != null &&
      this.now() - lastA < this.config.assessmentCooldownMs
    ) {
      timing.totalMs = this.now() - totalStart;
      this.lastTiming = timing;
      return {
        status: this.state.status === "ALERT" ? "ALERT" : "IDLE",
        assessment: null,
        alerts: [],
        signals: [],
        emittedAlerts: [],
        skipped: true,
        skipReason: "assessment_cooldown",
        timing,
      };
    }

    this.assessing = true;
    this.state.status = "OBSERVING";

    try {
      const o0 = this.now();
      let obs;
      try {
        obs = await this.getObservation();
      } catch (err) {
        this.state.status = "ERROR";
        timing.observationMs = this.now() - o0;
        timing.totalMs = this.now() - totalStart;
        this.lastTiming = timing;
        return {
          status: "ERROR",
          assessment: null,
          alerts: [],
          signals: [],
          emittedAlerts: [],
          skipped: false,
          timing,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      timing.observationMs = this.now() - o0;
      timing.contextMs = timing.observationMs;
      this.state.lastObservationAt = this.now();

      if (this.getSources) {
        try {
          this.lastSources = await this.getSources();
        } catch {
          this.lastSources = defaultSources();
        }
      }

      // Unavailable: empty observation with no usable domains
      const unavailable =
        obs.idleSeconds == null &&
        (obs.applications?.length ?? 0) === 0 &&
        !obs.activeApplication &&
        (obs.windows?.length ?? 0) === 0 &&
        !obs.system?.uptimeSeconds &&
        !obs.system?.memoryFreeBytes;
      if (
        unavailable &&
        this.lastSources.system === "UNAVAILABLE" &&
        this.lastSources.applications === "UNAVAILABLE" &&
        this.lastSources.activity === "UNAVAILABLE"
      ) {
        this.state.status = "UNAVAILABLE";
        timing.totalMs = this.now() - totalStart;
        this.lastTiming = timing;
        return {
          status: "UNAVAILABLE",
          assessment: null,
          alerts: [],
          signals: [],
          emittedAlerts: [],
          skipped: true,
          skipReason: "sources_unavailable",
          timing,
        };
      }

      this.state.status = "ASSESSING";
      let result;
      try {
        result = this.security.assess(obs, {
          updateBaseline: true,
          baselineAbsorbMaxLevel: this.config.baselineAbsorbMaxLevel,
          suppressOnAlert: true,
        });
      } catch (err) {
        this.state.status = "ERROR";
        timing.totalMs = this.now() - totalStart;
        this.lastTiming = timing;
        return {
          status: "ERROR",
          assessment: null,
          alerts: [],
          signals: [],
          emittedAlerts: [],
          skipped: false,
          timing,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      timing.signalMs = result.timing.signalCollectionMs;
      timing.baselineMs = result.timing.baselineMs;
      timing.assessmentMs = result.timing.assessmentMs;
      timing.correlationMs = result.timing.correlationMs;
      timing.alertMs = result.timing.alertFormattingMs;

      this.state.lastAssessmentAt = this.now();
      this.state.assessmentCount += 1;

      const stabilizedLevel = this.stabilizer.stabilize(
        result.assessment.level,
      );
      const assessment: ThreatAssessment = {
        ...result.assessment,
        level: stabilizedLevel,
        requiresUserAttention:
          stabilizedLevel === "MEDIUM" ||
          stabilizedLevel === "HIGH" ||
          stabilizedLevel === "CRITICAL",
      };
      this.lastRisk =
        stabilizedLevel === "INFO" && result.alerts.length === 0
          ? this.lastRisk === "NONE"
            ? "NONE"
            : stabilizedLevel
          : stabilizedLevel;

      const a0 = this.now();
      const emittedAlerts: DedupedSecurityAlert[] = [];
      for (const alert of result.alerts) {
        const adjusted = { ...alert, level: stabilizedLevel };
        const { emit } = this.deduper.consider(adjusted);
        if (emit) {
          emittedAlerts.push(emit);
          this.state.alertCount += 1;
          this.state.lastAlertAt = this.now();
          this.onAlert?.(emit);
        }
      }
      timing.alertMs += this.now() - a0;

      this.state.status =
        emittedAlerts.length > 0 ||
        stabilizedLevel === "MEDIUM" ||
        stabilizedLevel === "HIGH" ||
        stabilizedLevel === "CRITICAL"
          ? "ALERT"
          : "IDLE";

      timing.totalMs = this.now() - totalStart;
      this.lastTiming = timing;

      return {
        status: this.state.status,
        assessment,
        alerts: result.alerts,
        signals: result.signals,
        emittedAlerts,
        skipped: false,
        timing,
      };
    } finally {
      this.assessing = false;
    }
  }

  private armNext(delayMs: number): void {
    if (this.stopped || !this.config.enabled) return;
    this.timer?.cancel();
    const wait = clampMonitorInterval(
      delayMs > 0 ? delayMs : this.config.observationIntervalMs,
      delayMs === 0 ? 0 : this.config.minObservationIntervalMs,
    );
    // delayMs===0 allowed for immediate first tick in tests/start
    const actual = delayMs === 0 ? 0 : wait;
    this.timer = this.scheduleFn(() => {
      void this.tick().finally(() => {
        if (!this.stopped && this.config.enabled) {
          this.armNext(this.config.observationIntervalMs);
        }
      });
    }, actual);
  }
}

export function formatMonitorStatus(report: SecurityMonitorStatusReport): string {
  const m = report.monitor;
  const ago = (t: number | null): string => {
    if (t == null) return "never";
    const s = Math.max(0, (Date.now() - t) / 1000);
    return `${s.toFixed(1)}s ago`;
  };
  return [
    "SECURITY MONITOR",
    "----------------",
    "",
    `status: ${m.status}`,
    `enabled: ${m.enabled}`,
    "",
    `last observation: ${ago(m.lastObservationAt)}`,
    `last assessment: ${ago(m.lastAssessmentAt)}`,
    "",
    `assessments: ${m.assessmentCount}`,
    `alerts: ${m.alertCount}`,
    "",
    `current risk: ${report.currentRisk}`,
    "",
    "sources:",
    `system: ${report.sources.system}`,
    `applications: ${report.sources.applications}`,
    `screen: ${report.sources.screen}`,
    `activity: ${report.sources.activity}`,
    `files: ${report.sources.files}`,
    "",
    "Mode: monitoring + alert only — aucune action automatique.",
    report.disclaimer,
  ].join("\n");
}
