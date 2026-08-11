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
export { registerApplicationTools } from "../tools/registerApplicationTools.js";
export { registerScreenTools } from "../tools/registerScreenTools.js";
export { createScreenInfoTool } from "../tools/screenInfo.js";
export { createScreenWindowsTool } from "../tools/screenWindows.js";
export { createScreenActiveWindowTool } from "../tools/screenActiveWindow.js";
export { createScreenSessionTool } from "../tools/screenSession.js";
export { createScreenCaptureTool } from "../tools/screenCapture.js";
export { registerPresenceTools } from "../tools/registerPresenceTools.js";
export { createUserActivityTool } from "../tools/userActivity.js";
export { createUserPresenceTool } from "../tools/userPresence.js";
export { registerActionTools } from "../tools/registerActionTools.js";
export { createActionPlanTool } from "../tools/actionPlan.js";
export { createActionConfirmTool } from "../tools/actionConfirm.js";
export { createActionExecuteTool } from "../tools/actionExecute.js";
export { createActionCancelTool } from "../tools/actionCancel.js";
export { registerIntentTools } from "../tools/registerIntentTools.js";
export { createIntentUnderstandTool } from "../tools/intentUnderstand.js";
export { createIntentPlanTool } from "../tools/intentPlan.js";
export { createContextSnapshotTool } from "../tools/contextSnapshot.js";

export {
  ContextService,
  ContextFormatter,
  MemoryContextAuditLog,
} from "../context/index.js";
export type {
  ContextSnapshot,
  ContextQueryKind,
  ContextServiceResult,
  ContextTiming,
} from "../context/index.js";

export {
  MockLLMProvider,
  OllamaLLMProvider,
  IntentValidator,
  IntentRouter,
  toActionIntent,
  AI_ERROR_CODES,
  AI_LIMITS,
  JARVIS_ACTION_INTENT_TYPES,
  JARVIS_CONTEXT_INTENT_TYPES,
} from "../ai/index.js";
export type {
  LLMProvider,
  JarvisIntent,
  IntentRouterOutcome,
} from "../ai/index.js";

export {
  JarvisRuntime,
  ConversationContext,
  ResponseFormatter,
  MemoryRuntimeAuditLog,
  formatTiming,
  RUNTIME_ERROR_CODES,
} from "../runtime/index.js";
export type {
  JarvisResponse,
  RuntimeState,
  ProcessInputResult,
} from "../runtime/index.js";

export {
  ActionService,
  ActionRegistry,
  ActionPlanner,
  ActionRiskEvaluator,
  ActionPermissionPolicy,
  ActionConfirmation,
  ActionExecutor,
  MemoryActionAuditLog,
  ACTION_ERROR_CODES,
} from "../actions/index.js";
export type {
  ActionType,
  ActionPlan,
  ActionIntent,
  ActionConfirmationToken,
} from "../actions/index.js";

export {
  ScreenService,
  MockScreenBackend,
  ScreenPolicy,
  MemoryScreenAuditLog,
  SCREEN_ERROR_CODES,
} from "../screen/index.js";
export type {
  ScreenInfo,
  WindowInfo,
  SessionInfo,
  ScreenCaptureResult,
  ScreenBackend,
} from "../screen/index.js";

export {
  UserActivityService,
  MockUserActivityBackend,
  UserActivityPolicy,
  MemoryUserActivityAuditLog,
  USER_ACTIVITY_ERROR_CODES,
  presenceFromActivity,
  idleSecondsToBucket,
} from "../presence/index.js";
export type {
  UserActivityStatus,
  UserActivitySnapshot,
  UserPresenceSnapshot,
  UserActivityBackend,
} from "../presence/index.js";

export {
  MacOSScreenBackend,
  MacOSWindowDiscovery,
  MacOSUserActivityBackend,
} from "../platform/macos/index.js";
export { createApplicationListTool } from "../tools/applicationList.js";
export { createApplicationInfoTool } from "../tools/applicationInfo.js";
export { createApplicationActiveTool } from "../tools/applicationActive.js";
export { createApplicationOpenTool } from "../tools/applicationOpen.js";
export { createApplicationCloseTool } from "../tools/applicationClose.js";

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
  ApplicationRegistry,
  ApplicationResolver,
  ApplicationPolicy,
  MemoryApplicationAuditLog,
  ApplicationService,
  MockApplicationService,
  APPLICATION_ERROR_CODES,
  DENIED_SYSTEM_APPLICATIONS,
  MockApplicationBackend,
  MacOSApplicationBackend,
} from "../applications/index.js";
export type {
  ApplicationInfo as JarvisApplicationInfo,
  ApplicationResult,
  RegisteredApplication,
  ApplicationAuditEntry,
  ApplicationBackend,
  CapabilityReport,
} from "../applications/index.js";

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
  SophieInputEvent,
  SophieOutputEvent,
  SophiePublicSnapshot,
  SophieEmitResult,
  ContextSophieSignals as SophieContextSignals,
} from "../integration/index.js";
export {
  NullSophieBridge,
  createSophieBridgeMessage,
  SophieEventBus,
  SophieIntegration,
  SophieAPI,
  SOPHIE_INPUT_EVENT_TYPES,
  SOPHIE_OUTPUT_EVENT_TYPES,
  SOPHIE_ERROR_CODES,
} from "../integration/index.js";

export type { SecurityEvent, SecurityEventSeverity } from "../security/SecurityEvent.js";
export { createSecurityEvent } from "../security/SecurityEvent.js";
