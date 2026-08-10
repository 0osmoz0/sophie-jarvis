import path from "node:path";
import { RiskLevel } from "../permissions/RiskLevel.js";
import type { RegisteredApplication } from "./types.js";
import {
  APPLICATION_ERROR_CODES,
  DENIED_SYSTEM_APPLICATIONS,
  DENIED_SYSTEM_BUNDLE_IDS,
} from "./types.js";

export type ApplicationPolicyAction = "list" | "info" | "active" | "open" | "close";

export interface ApplicationPolicyDecision {
  allowed: boolean;
  riskLevel: RiskLevel;
  reason?: string;
  code?: string;
}

const BLOCKED_PATH_PREFIXES = [
  "/System/",
  "/Library/",
  "/private/",
  "/usr/",
  "/bin/",
  "/sbin/",
];

/**
 * ApplicationPolicy — denylist, path blocks, risk assignment.
 * Never allows shutdown/restart/logout/sleep in Phase 4.
 */
export class ApplicationPolicy {
  private readonly denylistNames: Set<string>;
  private readonly denylistBundles: Set<string>;

  constructor() {
    this.denylistNames = new Set(
      DENIED_SYSTEM_APPLICATIONS.map((n) => n.toLowerCase()),
    );
    this.denylistBundles = new Set(
      DENIED_SYSTEM_BUNDLE_IDS.map((b) => b.toLowerCase()),
    );
  }

  riskFor(action: ApplicationPolicyAction): RiskLevel {
    switch (action) {
      case "list":
      case "info":
      case "active":
        return RiskLevel.LOW;
      case "open":
        return RiskLevel.MEDIUM;
      case "close":
        return RiskLevel.MEDIUM;
    }
  }

  evaluate(
    action: ApplicationPolicyAction,
    app?: RegisteredApplication | null,
  ): ApplicationPolicyDecision {
    const riskLevel = this.riskFor(action);

    // Lifecycle mutations require a resolved app
    if ((action === "open" || action === "close" || action === "info") && !app) {
      return {
        allowed: false,
        riskLevel,
        reason: "Application identity required",
        code: APPLICATION_ERROR_CODES.INVALID_INPUT,
      };
    }

    if (app) {
      if (this.isDenylisted(app)) {
        // Close (and open) on system apps: denied
        if (action === "close" || action === "open") {
          return {
            allowed: false,
            riskLevel: RiskLevel.HIGH,
            reason: `Application "${app.name}" is on the system denylist and cannot be ${action}ed by JARVIS.`,
            code: APPLICATION_ERROR_CODES.DENYLIST,
          };
        }
      }

      if (
        (action === "open" || action === "close") &&
        app.path &&
        this.isBlockedPath(app.path)
      ) {
        return {
          allowed: false,
          riskLevel: RiskLevel.HIGH,
          reason: `Application path is in a blocked system area: ${app.path}`,
          code: APPLICATION_ERROR_CODES.BLOCKED_PATH,
        };
      }
    }

    // Explicitly forbid power/session verbs if ever passed as names
    if (app && isPowerVerb(app.name)) {
      return {
        allowed: false,
        riskLevel: RiskLevel.CRITICAL,
        reason: "shutdown/restart/logout/sleep are not part of Phase 4",
        code: APPLICATION_ERROR_CODES.DENIED,
      };
    }

    return { allowed: true, riskLevel };
  }

  isDenylisted(app: RegisteredApplication): boolean {
    if (this.denylistNames.has(app.name.toLowerCase())) return true;
    if (app.bundleId && this.denylistBundles.has(app.bundleId.toLowerCase())) {
      return true;
    }
    if (app.aliases?.some((a) => this.denylistNames.has(a.toLowerCase()))) {
      return true;
    }
    return false;
  }

  isBlockedPath(appPath: string): boolean {
    const resolved = path.resolve(appPath);
    // Allow /Applications and /Users/.../Applications — block system trees
    for (const prefix of BLOCKED_PATH_PREFIXES) {
      if (resolved === prefix.slice(0, -1) || resolved.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  getDenylistNames(): string[] {
    return [...DENIED_SYSTEM_APPLICATIONS];
  }
}

function isPowerVerb(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n === "shutdown" ||
    n === "restart" ||
    n === "reboot" ||
    n === "logout" ||
    n === "sleep" ||
    n === "power off"
  );
}
