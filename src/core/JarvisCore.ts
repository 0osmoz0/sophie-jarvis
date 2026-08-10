import { Context } from "./Context.js";
import { EventBus } from "./EventBus.js";
import { TaskManager } from "./TaskManager.js";
import type {
  ConfirmationToken,
  Intent,
  JarvisCoreResult,
  Task,
} from "./types.js";
import { PermissionManager } from "../permissions/PermissionManager.js";
import type { ToolRegistry } from "../tools/ToolRegistry.js";
import type { Tool } from "../tools/Tool.js";
import {
  createSophieBridgeMessage,
  type SophieBridge,
  NullSophieBridge,
} from "../integration/SophieBridge.js";

export interface JarvisCoreOptions {
  registry: ToolRegistry;
  permissions?: PermissionManager;
  tasks?: TaskManager;
  events?: EventBus;
  context?: Context;
  sophieBridge?: SophieBridge;
}

/**
 * JarvisCore — sole orchestrator for structured Intent → Tool execution.
 *
 * Flow:
 *   Intent → find Tool → PermissionManager → Task → execute → Result + Events
 *
 * Never: LLM → shell
 * Never: Tool.execute without PermissionManager approval
 */
export class JarvisCore {
  readonly registry: ToolRegistry;
  readonly permissions: PermissionManager;
  readonly tasks: TaskManager;
  readonly events: EventBus;
  readonly context: Context;
  readonly sophieBridge: SophieBridge;

  constructor(options: JarvisCoreOptions) {
    this.registry = options.registry;
    this.permissions = options.permissions ?? new PermissionManager();
    this.tasks = options.tasks ?? new TaskManager();
    this.events = options.events ?? new EventBus();
    this.context = options.context ?? new Context();
    this.sophieBridge = options.sophieBridge ?? new NullSophieBridge();
  }

  /**
   * Process a structured intent.
   * Natural language is NOT supported — callers must supply { tool, arguments }.
   */
  async handleIntent(
    intent: Intent,
    confirmation?: ConfirmationToken,
  ): Promise<JarvisCoreResult> {
    this.assertValidIntent(intent);

    const tool = this.registry.get(intent.tool);
    if (!tool) {
      throw new JarvisCoreError(
        `Unknown tool: "${intent.tool}"`,
        "UNKNOWN_TOOL",
      );
    }

    const args = intent.arguments ?? {};
    if (tool.validate) {
      const validationError = tool.validate(args);
      if (validationError) {
        throw new JarvisCoreError(validationError, "INVALID_ARGUMENTS");
      }
    }

    const task = this.tasks.create({
      description: `Execute ${tool.name} (${tool.id})`,
      toolId: tool.id,
      riskLevel: tool.riskLevel,
      arguments: args,
    });

    this.events.emit("task_created", {
      taskId: task.id,
      toolId: tool.id,
      description: task.description,
    });

    this.context._setCurrentTask(task);
    void this.sophieBridge.notify(
      createSophieBridgeMessage("task_update", {
        taskId: task.id,
        status: task.status,
        toolId: tool.id,
      }),
    );

    const permissionRequest = {
      toolId: tool.id,
      riskLevel: tool.riskLevel,
      arguments: args,
      taskId: task.id,
    };

    const permission =
      confirmation?.confirmed && confirmation.taskId === task.id
        ? this.permissions.evaluateWithConfirmation(permissionRequest, true)
        : this.permissions.evaluate(permissionRequest);

    if (permission.decision === "deny") {
      const failed = this.tasks.markFailed(task.id, permission.reason);
      this.events.emit("task_failed", {
        taskId: failed.id,
        toolId: tool.id,
        error: permission.reason,
      });
      this.context._setCurrentTask(failed);
      void this.sophieBridge.notify(
        createSophieBridgeMessage("result", {
          taskId: failed.id,
          ok: false,
          error: permission.reason,
        }),
      );
      return { task: failed, permission, executed: false };
    }

    if (permission.decision === "require_confirmation") {
      // If caller already confirmed a *previous* waiting task, handle via confirmTask.
      if (
        confirmation?.confirmed &&
        confirmation.taskId !== task.id
      ) {
        // Confirmation token does not match this newly created task.
      }

      const waiting = this.tasks.markWaitingConfirmation(task.id);
      this.events.emit("task_waiting_confirmation", {
        taskId: waiting.id,
        toolId: tool.id,
        riskLevel: tool.riskLevel,
        reason: permission.reason,
      });
      this.context._setCurrentTask(waiting);
      void this.sophieBridge.notify(
        createSophieBridgeMessage("permission_request", {
          taskId: waiting.id,
          toolId: tool.id,
          riskLevel: tool.riskLevel,
          reason: permission.reason,
        }),
      );
      return { task: waiting, permission, executed: false };
    }

    // decision === "allow"
    return this.runTool(tool, task, args, permission);
  }

  /**
   * Confirm a task that is waiting_confirmation, then execute if still allowed.
   */
  async confirmTask(
    taskId: string,
    token: ConfirmationToken,
  ): Promise<JarvisCoreResult> {
    if (!token.confirmed || token.taskId !== taskId) {
      throw new JarvisCoreError(
        "Invalid confirmation token",
        "INVALID_CONFIRMATION",
      );
    }

    const existing = this.tasks.get(taskId);
    if (!existing) {
      throw new JarvisCoreError(`Task not found: ${taskId}`, "TASK_NOT_FOUND");
    }
    if (existing.status !== "waiting_confirmation") {
      throw new JarvisCoreError(
        `Task ${taskId} is not waiting for confirmation (status=${existing.status})`,
        "INVALID_TASK_STATE",
      );
    }

    const tool = this.registry.get(existing.toolId);
    if (!tool) {
      const failed = this.tasks.markFailed(
        taskId,
        `Tool no longer registered: ${existing.toolId}`,
      );
      this.events.emit("task_failed", {
        taskId: failed.id,
        toolId: existing.toolId,
        error: failed.error ?? "missing tool",
      });
      return {
        task: failed,
        permission: {
          decision: "deny",
          reason: failed.error ?? "missing tool",
        },
        executed: false,
      };
    }

    const permissionRequest = {
      toolId: tool.id,
      riskLevel: tool.riskLevel,
      arguments: existing.arguments,
      taskId,
    };

    const permission = this.permissions.evaluateWithConfirmation(
      permissionRequest,
      true,
    );

    if (permission.decision !== "allow") {
      const reason =
        permission.decision === "deny"
          ? permission.reason
          : "Confirmation insufficient";
      const failed = this.tasks.markFailed(taskId, reason);
      this.events.emit("task_failed", {
        taskId: failed.id,
        toolId: tool.id,
        error: reason,
      });
      this.context._setCurrentTask(failed);
      return { task: failed, permission, executed: false };
    }

    return this.runTool(tool, existing, existing.arguments, permission);
  }

  private async runTool(
    tool: Tool,
    task: Task,
    args: Record<string, unknown>,
    permission: { decision: "allow" },
  ): Promise<JarvisCoreResult> {
    const running = this.tasks.markRunning(task.id);
    this.events.emit("task_started", {
      taskId: running.id,
      toolId: tool.id,
    });
    this.context._setCurrentTask(running);

    try {
      const result = await tool.execute(args);
      if (!result.ok) {
        const failed = this.tasks.markFailed(
          task.id,
          result.error ?? "Tool returned ok:false",
        );
        this.events.emit("task_failed", {
          taskId: failed.id,
          toolId: tool.id,
          error: failed.error ?? "unknown",
        });
        this.context._setCurrentTask(failed);
        void this.sophieBridge.notify(
          createSophieBridgeMessage("result", {
            taskId: failed.id,
            ok: false,
            error: failed.error,
          }),
        );
        return { task: failed, permission, executed: true };
      }

      const completed = this.tasks.markCompleted(task.id, result.data);
      this.events.emit("task_completed", {
        taskId: completed.id,
        toolId: tool.id,
        result: result.data,
      });
      this.context._setCurrentTask(completed);
      void this.sophieBridge.notify(
        createSophieBridgeMessage("result", {
          taskId: completed.id,
          ok: true,
          data: result.data,
        }),
      );
      return { task: completed, permission, executed: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = this.tasks.markFailed(task.id, message);
      this.events.emit("task_failed", {
        taskId: failed.id,
        toolId: tool.id,
        error: message,
      });
      this.context._setCurrentTask(failed);
      void this.sophieBridge.notify(
        createSophieBridgeMessage("result", {
          taskId: failed.id,
          ok: false,
          error: message,
        }),
      );
      return { task: failed, permission, executed: true };
    }
  }

  private assertValidIntent(intent: Intent): void {
    if (!intent || typeof intent !== "object") {
      throw new JarvisCoreError("Intent must be an object", "MALFORMED_INTENT");
    }
    if (typeof intent.tool !== "string" || intent.tool.trim() === "") {
      throw new JarvisCoreError(
        'Intent.tool must be a non-empty string',
        "MALFORMED_INTENT",
      );
    }
    if (
      intent.arguments !== undefined &&
      (typeof intent.arguments !== "object" ||
        intent.arguments === null ||
        Array.isArray(intent.arguments))
    ) {
      throw new JarvisCoreError(
        "Intent.arguments must be a plain object when provided",
        "MALFORMED_INTENT",
      );
    }
  }
}

export class JarvisCoreError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "JarvisCoreError";
    this.code = code;
  }
}
