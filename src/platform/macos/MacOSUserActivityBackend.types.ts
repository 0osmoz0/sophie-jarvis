/**
 * Optional native bridge for aggregate idle duration only.
 * Must NOT expose key/mouse event streams.
 */
export interface MacOSUserActivityNativeBridge {
  /** Aggregate system idle time in seconds (HID idle). */
  getIdleTimeSeconds(): Promise<number>;
}

export type MacOSUserActivityNativeStatus =
  | "bridge_missing"
  | "bridge_loaded"
  | "not_darwin"
  | "permission_required"
  | "ok"
  | "error";
