/**
 * JARVIS Core — Phase 1 public surface.
 * Independent of the Sophie repository. Safe-by-design foundation only.
 */

export { RiskLevel, RISK_LEVEL_ORDER, isRiskLevel, compareRiskLevel } from "../permissions/RiskLevel.js";
export { PermissionManager } from "../permissions/PermissionManager.js";
export type { PermissionManagerOptions } from "../permissions/PermissionManager.js";

export { EventBus } from "./EventBus.js";
export type { JarvisEventMap, JarvisEventName, EventHandler } from "./EventBus.js";

export { Context } from "./Context.js";
export { TaskManager } from "./TaskManager.js";
export type { CreateTaskInput } from "./TaskManager.js";

export { JarvisCore, JarvisCoreError } from "./JarvisCore.js";
export type { JarvisCoreOptions } from "./JarvisCore.js";

export type {
  Intent,
  ConfirmationToken,
  Task,
  TaskStatus,
  JarvisContextSnapshot,
  ToolExecutionRequest,
  PermissionDecision,
  ToolResult,
  JarvisCoreResult,
  UserPresence,
  SecurityState,
} from "./types.js";

export type { Tool } from "../tools/Tool.js";
export { isTool } from "../tools/Tool.js";
export { ToolRegistry } from "../tools/ToolRegistry.js";
export { systemInfoTool, JARVIS_APP_VERSION } from "../tools/systemInfo.js";
export type { SystemInfoData } from "../tools/systemInfo.js";
export { createSystemObserveTool } from "../tools/systemObserve.js";
export { registerFileTools } from "../tools/registerFileTools.js";
export { createFileListTool } from "../tools/fileList.js";
export { createFileInfoTool } from "../tools/fileInfo.js";
export { createFileCopyTool } from "../tools/fileCopy.js";
export { createFileMoveTool } from "../tools/fileMove.js";
export { createFileCreateTool } from "../tools/fileCreate.js";
export { createFileDeleteTool } from "../tools/fileDelete.js";

export {
  FileService,
  FilePolicy,
  FilePathResolver,
  MemoryFileAuditLog,
  FILE_ERROR_CODES,
} from "../files/index.js";
export type {
  FileResult,
  FileError,
  FileListEntry,
  FileInfoData,
  DryRunPlan,
  FileAuditEntry,
  FileAuditSink,
} from "../files/index.js";

export {
  SystemObserver,
  ProcessObserver,
  ApplicationObserver,
  UserActivityObserver,
  FileObserver,
  ScreenObserver,
  ObservationCache,
  ObservationService,
} from "../observation/index.js";
export type {
  ObservationSnapshot,
  ObservationServiceConfig,
  ObservationServiceOptions,
  UserActivityState,
  SystemObservation,
  ProcessObservation,
  ApplicationObservation,
  UserActivityObservation,
  FileObservation,
  ScreenSnapshot,
  FileObserverConfig,
} from "../observation/index.js";

export type {
  AIProvider,
  AIGenerateRequest,
  AIGenerateResult,
  AIAnalyzeRequest,
  AIAnalyzeResult,
  AIClassifyRequest,
  AIClassifyResult,
} from "../intelligence/AIProvider.js";
export { MockAIProvider } from "../intelligence/MockAIProvider.js";

export type {
  SophieBridge,
  SophieBridgeMessage,
  SophieBridgeMessageType,
} from "../integration/SophieBridge.js";
export {
  NullSophieBridge,
  createSophieBridgeMessage,
} from "../integration/SophieBridge.js";

export type { SecurityEvent, SecurityEventSeverity } from "../security/SecurityEvent.js";
export { createSecurityEvent } from "../security/SecurityEvent.js";
