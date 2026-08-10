import type { ApplicationInfo, ApplicationResult } from "../applications/types.js";

/**
 * Platform-agnostic application lifecycle backend.
 * Never exposes generic command / script execution.
 */
export type BackendCapability =
  | "listApplications"
  | "getApplicationInfo"
  | "isApplicationRunning"
  | "getActiveApplication"
  | "openApplication"
  | "closeApplication";

export type CapabilityStatus = "AVAILABLE" | "UNAVAILABLE" | "PERMISSION_REQUIRED";

export interface CapabilityReport {
  capability: BackendCapability;
  status: CapabilityStatus;
  /** Human-readable permission name when PERMISSION_REQUIRED. */
  permission?: string | null;
  reason?: string | null;
}

/** Typed identity only — never a shell command string. */
export interface BackendApplicationIdentity {
  id?: string | null;
  name?: string | null;
  bundleId?: string | null;
  path?: string | null;
}

export interface ApplicationBackend {
  readonly name: string;

  getCapabilityStatus(capability: BackendCapability): CapabilityReport;

  listApplications(): Promise<ApplicationResult<{ applications: ApplicationInfo[] }>>;

  getApplicationInfo(
    identity: BackendApplicationIdentity,
  ): Promise<ApplicationResult<ApplicationInfo>>;

  isApplicationRunning(
    identity: BackendApplicationIdentity,
  ): Promise<ApplicationResult<{ running: boolean }>>;

  getActiveApplication(): Promise<ApplicationResult<ApplicationInfo | null>>;

  openApplication(
    identity: BackendApplicationIdentity,
  ): Promise<ApplicationResult<ApplicationInfo>>;

  closeApplication(
    identity: BackendApplicationIdentity,
  ): Promise<ApplicationResult<ApplicationInfo>>;
}
