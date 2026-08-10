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
