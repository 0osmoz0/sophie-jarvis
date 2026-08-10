export type {
  ScreenBounds,
  ScreenInfo,
  WindowInfo,
  SessionInfo,
  ScreenImage,
  ScreenCaptureResult,
  ScreenError,
  ScreenResult,
  ScreenAction,
  ScreenCapabilityStatus,
  ScreenCapabilityReport,
  ScreenAuditEntry,
  ScreenAuditSink,
} from "./types.js";
export { SCREEN_ERROR_CODES } from "./types.js";

export type { ScreenBackend } from "./ScreenBackend.js";
export { MockScreenBackend } from "./MockScreenBackend.js";
export { ScreenPolicy } from "./ScreenPolicy.js";
export { MemoryScreenAuditLog } from "./ScreenAuditLog.js";
export { ScreenService } from "./ScreenService.js";
export type { ScreenServiceOptions } from "./ScreenService.js";
