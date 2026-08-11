/**
 * Collects passive security signals by comparing observation vs baseline.
 * Phase 15: richer kinds + presence transitions. DETECTION ONLY.
 */
import { createSecuritySignal, appKey } from "./SecuritySignal.js";
import type { SecurityBaseline } from "./SecurityBaseline.js";
import type {
  SecurityObservationInput,
  SecurityPresenceBucket,
  SecuritySignal,
} from "./types.js";

const RECENTLY_IDLE_SEC = 30;
const IDLE_SEC = 120;
const LONG_IDLE_SEC = 900;

const KNOWN_BENIGN_HINTS = [
  "spotify",
  "chrome",
  "safari",
  "firefox",
  "code",
  "visual studio code",
  "cursor",
  "discord",
  "slack",
  "finder",
  "terminal",
  "iterm",
  "mail",
  "notes",
  "music",
  "steam",
];

export class SecuritySignalCollector {
  collect(
    obs: SecurityObservationInput,
    baseline: SecurityBaseline,
  ): { signals: SecuritySignal[]; presence: SecurityPresenceBucket } {
    const signals: SecuritySignal[] = [];
    const presence = classifyPresence(obs.idleSeconds);
    signals.push(
      createSecuritySignal({
        category: "USER_PRESENCE",
        kind:
          presence === "UNKNOWN"
            ? "presence_unknown"
            : presence === "ACTIVE"
              ? "user_active"
              : presence === "RECENTLY_IDLE"
                ? "user_recently_idle"
                : presence === "LONG_IDLE"
                  ? "user_long_idle"
                  : "user_idle",
        severity: presence === "LONG_IDLE" ? "LOW" : "INFO",
        confidence:
          presence === "UNKNOWN" ? 0.2 : presence === "LONG_IDLE" ? 0.55 : 0.7,
        reason: presenceReason(presence, obs.idleSeconds),
        evidence: [
          {
            key: "idleSeconds",
            value:
              obs.idleSeconds == null ? "unknown" : String(obs.idleSeconds),
          },
          { key: "presenceBucket", value: presence },
        ],
        timestamp: obs.timestamp,
      }),
    );

    const transition = baseline.recordPresence(presence, obs.timestamp);
    if (transition) {
      const noteworthy =
        (isIdleish(transition.from) && transition.to === "ACTIVE") ||
        (transition.from === "ACTIVE" && isIdleish(transition.to));
      if (noteworthy) {
        signals.push(
          createSecuritySignal({
            category: "SESSION",
            kind: "UNUSUAL_SESSION_TRANSITION",
            severity: "INFO",
            confidence: 0.45,
            reason: `Presence bucket changed ${transition.from} → ${transition.to} (software idle indicator only).`,
            evidence: [
              { key: "from", value: transition.from },
              { key: "to", value: transition.to },
            ],
            timestamp: obs.timestamp,
          }),
        );
      }
    }

    const base = baseline.getCurrent();
    if (!base) {
      return { signals, presence };
    }

    const currentKeys = new Set(
      (obs.applications ?? [])
        .map((a) => appKey(a))
        .filter((k): k is string => !!k),
    );
    const baseKeys = new Set(base.applicationKeys);
    for (const key of currentKeys) {
      if (!baseKeys.has(key)) {
        const benign = isBenignKey(key) || baseline.isHabitualApp(key);
        const idleish = isIdleish(presence);
        const kind = benign ? "NEW_APPLICATION" : "UNUSUAL_APPLICATION";
        // Keep legacy aliases for Phase 14 engine compatibility via dual emit? 
        // Prefer new kinds; engine updated to recognize both.
        signals.push(
          createSecuritySignal({
            category: "APPLICATION",
            kind,
            severity: idleish && !benign ? "LOW" : "INFO",
            confidence: idleish && !benign ? 0.45 : 0.35,
            reason: idleish
              ? "A new application appeared while the user may have been inactive."
              : baseline.isHabitualApp(key)
                ? "A habitual session application reappeared."
                : "A new application appeared compared to the recent baseline.",
            evidence: [
              { key: "application", value: key },
              { key: "benignHint", value: String(benign) },
              { key: "habitual", value: String(baseline.isHabitualApp(key)) },
              { key: "presence", value: presence },
            ],
            timestamp: obs.timestamp,
          }),
        );
      }
    }
    for (const key of baseKeys) {
      if (!currentKeys.has(key)) {
        signals.push(
          createSecuritySignal({
            category: "APPLICATION",
            kind: "application_stopped",
            severity: "INFO",
            confidence: 0.4,
            reason: "An application from the baseline is no longer observed.",
            evidence: [{ key: "application", value: key }],
            timestamp: obs.timestamp,
          }),
        );
      }
    }

    // App returned after being absent from recent baseline history
    for (const key of currentKeys) {
      if (
        !baseKeys.has(key) &&
        baseline.appSeenCount(key) > 0 &&
        !isBenignKey(key)
      ) {
        signals.push(
          createSecuritySignal({
            category: "APPLICATION",
            kind: "UNEXPECTED_APPLICATION_RETURN",
            severity: "INFO",
            confidence: 0.4,
            reason:
              "An application previously seen in session reappeared after baseline gap.",
            evidence: [
              { key: "application", value: key },
              { key: "seenCount", value: String(baseline.appSeenCount(key)) },
            ],
            timestamp: obs.timestamp,
          }),
        );
      }
    }

    const activeKey = obs.activeApplication
      ? appKey(obs.activeApplication)
      : null;
    if (
      activeKey &&
      base.activeKey &&
      activeKey !== base.activeKey
    ) {
      const unexpected =
        !baseKeys.has(activeKey) &&
        !isBenignKey(activeKey) &&
        !baseline.isHabitualApp(activeKey);
      signals.push(
        createSecuritySignal({
          category: "APPLICATION",
          kind: unexpected
            ? "unexpected_application"
            : "FRONTMOST_CHANGE",
          severity: unexpected && presence !== "ACTIVE" ? "LOW" : "INFO",
          confidence: unexpected ? 0.5 : 0.4,
          reason: unexpected
            ? "An unfamiliar application became frontmost relative to the baseline."
            : "The frontmost application changed.",
          evidence: [
            { key: "previous", value: base.activeKey },
            { key: "current", value: activeKey },
            { key: "presence", value: presence },
          ],
          timestamp: obs.timestamp,
        }),
      );
    }

    const windowKeys = new Set(
      (obs.windows ?? [])
        .map((w) =>
          w.applicationName
            ? `name:${w.applicationName.trim().toLowerCase()}`
            : null,
        )
        .filter((k): k is string => !!k),
    );
    for (const key of windowKeys) {
      if (!base.windowAppKeys.includes(key) && !baseKeys.has(key)) {
        signals.push(
          createSecuritySignal({
            category: "SCREEN",
            kind: "UNUSUAL_SCREEN_CHANGE",
            severity: "INFO",
            confidence: 0.35,
            reason:
              "A window application name appeared that was not in the baseline.",
            evidence: [{ key: "windowApp", value: key }],
            timestamp: obs.timestamp,
          }),
        );
      }
    }
    const aw = obs.activeWindow?.applicationName
      ? `name:${obs.activeWindow.applicationName.trim().toLowerCase()}`
      : null;
    if (aw && base.activeKey && aw !== base.activeKey) {
      signals.push(
        createSecuritySignal({
          category: "SCREEN",
          kind: "new_frontmost_application",
          severity: "INFO",
          confidence: 0.35,
          reason: "Active window application differs from baseline frontmost.",
          evidence: [
            { key: "activeWindow", value: aw },
            { key: "baselineActive", value: base.activeKey },
          ],
          timestamp: obs.timestamp,
        }),
      );
    }

    const fileMap = new Map(
      (obs.files ?? []).map((f) => [f.key, f] as const),
    );
    const baseFileMap = new Map(
      base.fileFingerprints.map((f) => [f.key, f] as const),
    );
    let fileChanges = 0;
    for (const [key, file] of fileMap) {
      const prev = baseFileMap.get(key);
      if (!prev) {
        fileChanges += 1;
        signals.push(
          createSecuritySignal({
            category: "FILE",
            kind: "new_file",
            severity: "INFO",
            confidence: 0.4,
            reason: "A new allowed-path file key appeared vs baseline.",
            evidence: [{ key: "file", value: key }],
            timestamp: obs.timestamp,
          }),
        );
        continue;
      }
      if (
        (file.mtimeMs != null &&
          prev.mtimeMs != null &&
          file.mtimeMs !== prev.mtimeMs) ||
        (file.size != null && prev.size != null && file.size !== prev.size)
      ) {
        fileChanges += 1;
        signals.push(
          createSecuritySignal({
            category: "FILE",
            kind: "modified_file",
            severity: "INFO",
            confidence: 0.45,
            reason: "A watched file metadata fingerprint changed.",
            evidence: [{ key: "file", value: key }],
            timestamp: obs.timestamp,
          }),
        );
      }
      if (file.extension && isUnexpectedExtension(file.extension)) {
        fileChanges += 1;
        signals.push(
          createSecuritySignal({
            category: "FILE",
            kind: "unexpected_extension",
            severity: "LOW",
            confidence: 0.4,
            reason: "A watched path has an unusual extension.",
            evidence: [
              { key: "file", value: key },
              { key: "extension", value: file.extension },
            ],
            timestamp: obs.timestamp,
          }),
        );
      }
    }
    for (const key of baseFileMap.keys()) {
      const cur = fileMap.get(key);
      if (cur && cur.exists === false) {
        fileChanges += 1;
        signals.push(
          createSecuritySignal({
            category: "FILE",
            kind: "deleted_file",
            severity: "LOW",
            confidence: 0.5,
            reason: "A previously watched file key is reported missing.",
            evidence: [{ key: "file", value: key }],
            timestamp: obs.timestamp,
          }),
        );
      }
    }
    if (fileChanges >= 2 && isIdleish(presence)) {
      signals.push(
        createSecuritySignal({
          category: "FILE",
          kind: "UNUSUAL_FILE_ACTIVITY",
          severity: "LOW",
          confidence: 0.5,
          reason:
            "Multiple watched-file metadata changes while idle indicators elevated.",
          evidence: [{ key: "fileChangeCount", value: String(fileChanges) }],
          timestamp: obs.timestamp,
        }),
      );
    }

    if (
      obs.system?.memoryFreeBytes != null &&
      base.memoryFreeBytes != null &&
      base.memoryFreeBytes > 0
    ) {
      const ratio = obs.system.memoryFreeBytes / base.memoryFreeBytes;
      if (ratio < 0.35) {
        signals.push(
          createSecuritySignal({
            category: "SYSTEM",
            kind: "memory_pressure_unusual",
            severity: "LOW",
            confidence: 0.4,
            reason: "Free memory dropped substantially vs recent baseline.",
            evidence: [
              {
                key: "freeBytes",
                value: String(obs.system.memoryFreeBytes),
              },
              { key: "baselineFreeBytes", value: String(base.memoryFreeBytes) },
            ],
            timestamp: obs.timestamp,
          }),
        );
      }
    }
    if (
      obs.system?.uptimeSeconds != null &&
      base.uptimeSeconds != null &&
      obs.system.uptimeSeconds + 30 < base.uptimeSeconds
    ) {
      signals.push(
        createSecuritySignal({
          category: "SYSTEM",
          kind: "uptime_reset",
          severity: "MEDIUM",
          confidence: 0.55,
          reason: "System uptime decreased vs baseline (possible reboot).",
          evidence: [
            { key: "uptime", value: String(obs.system.uptimeSeconds) },
            { key: "baselineUptime", value: String(base.uptimeSeconds) },
          ],
          timestamp: obs.timestamp,
        }),
      );
    }

    if (obs.sessionLocked === true) {
      signals.push(
        createSecuritySignal({
          category: "SESSION",
          kind: "session_locked",
          severity: "INFO",
          confidence: 0.6,
          reason: "Session reported as locked.",
          evidence: [{ key: "locked", value: "true" }],
          timestamp: obs.timestamp,
        }),
      );
    }

    // Activity pattern: long idle then sudden multi-app churn
    if (
      presence === "ACTIVE" &&
      transition?.from === "LONG_IDLE" &&
      currentKeys.size > baseKeys.size + 1
    ) {
      signals.push(
        createSecuritySignal({
          category: "ENVIRONMENT",
          kind: "UNUSUAL_ACTIVITY_PATTERN",
          severity: "LOW",
          confidence: 0.45,
          reason:
            "Return from long idle coincided with multiple new applications.",
          evidence: [
            { key: "newAppDelta", value: String(currentKeys.size - baseKeys.size) },
          ],
          timestamp: obs.timestamp,
        }),
      );
    }

    return { signals, presence };
  }
}

export function classifyPresence(
  idleSeconds: number | null | undefined,
): SecurityPresenceBucket {
  if (idleSeconds == null || !Number.isFinite(idleSeconds)) return "UNKNOWN";
  if (idleSeconds < RECENTLY_IDLE_SEC) return "ACTIVE";
  if (idleSeconds < IDLE_SEC) return "RECENTLY_IDLE";
  if (idleSeconds < LONG_IDLE_SEC) return "IDLE";
  return "LONG_IDLE";
}

function isIdleish(presence: string): boolean {
  return (
    presence === "IDLE" ||
    presence === "LONG_IDLE" ||
    presence === "RECENTLY_IDLE"
  );
}

function presenceReason(
  presence: SecurityPresenceBucket,
  idle: number | null | undefined,
): string {
  switch (presence) {
    case "ACTIVE":
      return "User activity indicators suggest recent input (not physical presence proof).";
    case "RECENTLY_IDLE":
      return `Short idle observed (${idle ?? "?"}s). Not proof of physical absence.`;
    case "IDLE":
      return `User appears idle (${idle ?? "?"}s). IDLE ≠ physically absent.`;
    case "LONG_IDLE":
      return `Long idle observed (${idle ?? "?"}s). Still not physical absence confirmation.`;
    default:
      return "User presence is unknown.";
  }
}

function isBenignKey(key: string): boolean {
  const lower = key.toLowerCase();
  return KNOWN_BENIGN_HINTS.some((h) => lower.includes(h));
}

function isUnexpectedExtension(ext: string): boolean {
  const e = ext.replace(/^\./, "").toLowerCase();
  return ["scpt", "command", "dylib", "pkg", "dmg"].includes(e);
}
