import type {
  UserActivityCapabilityReport,
  UserActivityResult,
  UserActivitySnapshot,
} from "./types.js";

/**
 * UserActivityBackend — aggregate idle/activity only.
 * Never exposes key events, mouse events, or histories.
 */
export interface UserActivityBackend {
  readonly name: string;

  getCapabilityStatus(
    capability: "getActivitySnapshot" | "getIdleDuration",
  ): UserActivityCapabilityReport;

  /** Raw idle duration in seconds from platform (aggregate only). */
  getIdleDuration(): Promise<UserActivityResult<{ idleSeconds: number | null }>>;

  /**
   * Optional raw snapshot from backend before state machine.
   * May return UNAVAILABLE.
   */
  getActivitySnapshot(): Promise<UserActivityResult<UserActivitySnapshot>>;
}
