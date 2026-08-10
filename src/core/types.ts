import type { RiskLevel } from "../permissions/RiskLevel.js";

/** Structured intent — the only entry point into JarvisCore. No NL parsing. */
export interface Intent {
  tool: string;
  arguments?: Record<string, unknown>;
}

/** Optional confirmation token supplied after user approval. */
export interface ConfirmationToken {
  /** Task id that was waiting for confirmation. */
  taskId: string;
  /** Explicit acknowledgement from the user / UI layer. */
  confirmed: true;
  /** Optional free-form note (audit). */
  note?: string;
}

export type TaskStatus =
  | "pending"
  | "running"
  | "waiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled";

export interface Task {
  id: string;
  description: string;
  toolId: string;
  riskLevel: RiskLevel;
  status: TaskStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: unknown | null;
  error: string | null;
  arguments: Record<string, unknown>;
}

export type UserPresence = "present" | "away" | "unknown" | null;
export type SecurityState = "nominal" | "elevated" | "unknown" | null;

export interface JarvisContextSnapshot {
  timestamp: string;
  userPresence: UserPresence;
  activeApplication: string | null | "unknown";
  securityState: SecurityState;
  currentTask: Task | null;
}

export interface ToolExecutionRequest {
  toolId: string;
  riskLevel: RiskLevel;
  arguments: Record<string, unknown>;
  taskId: string;
}

export type PermissionDecision =
  | { decision: "allow" }
  | { decision: "require_confirmation"; reason: string }
  | { decision: "deny"; reason: string };

export interface ToolExecuteResult {
  ok: true;
  data: unknown;
}

export interface ToolExecuteError {
  ok: false;
  error: string;
}

export type ToolResult = ToolExecuteResult | ToolExecuteError;

export interface JarvisCoreResult {
  task: Task;
  permission: PermissionDecision;
  executed: boolean;
}
