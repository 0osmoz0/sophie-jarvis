import type { RiskLevel } from "../permissions/RiskLevel.js";
import type { Task, TaskStatus } from "./types.js";

let taskCounter = 0;

function nextTaskId(): string {
  taskCounter += 1;
  return `task_${Date.now()}_${taskCounter}`;
}

export interface CreateTaskInput {
  description: string;
  toolId: string;
  riskLevel: RiskLevel;
  arguments?: Record<string, unknown>;
}

/**
 * TaskManager orchestrates task lifecycle.
 * It does NOT execute system commands — only tracks state.
 */
export class TaskManager {
  private readonly tasks = new Map<string, Task>();

  create(input: CreateTaskInput): Task {
    const task: Task = {
      id: nextTaskId(),
      description: input.description,
      toolId: input.toolId,
      riskLevel: input.riskLevel,
      status: "pending",
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      arguments: input.arguments ?? {},
    };
    this.tasks.set(task.id, task);
    return { ...task };
  }

  get(id: string): Task | undefined {
    const task = this.tasks.get(id);
    return task ? { ...task } : undefined;
  }

  list(): Task[] {
    return [...this.tasks.values()].map((t) => ({ ...t }));
  }

  private mutate(
    id: string,
    updater: (task: Task) => void,
  ): Task {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    updater(task);
    return { ...task };
  }

  private assertTransition(from: TaskStatus, to: TaskStatus): void {
    const allowed: Record<TaskStatus, TaskStatus[]> = {
      pending: ["running", "waiting_confirmation", "cancelled", "failed"],
      running: ["completed", "failed", "cancelled", "waiting_confirmation"],
      waiting_confirmation: ["running", "cancelled", "failed"],
      completed: [],
      failed: [],
      cancelled: [],
    };
    if (!allowed[from].includes(to)) {
      throw new Error(`Invalid task transition: ${from} → ${to}`);
    }
  }

  markRunning(id: string): Task {
    return this.mutate(id, (task) => {
      this.assertTransition(task.status, "running");
      task.status = "running";
      if (!task.startedAt) {
        task.startedAt = new Date().toISOString();
      }
    });
  }

  markWaitingConfirmation(id: string): Task {
    return this.mutate(id, (task) => {
      this.assertTransition(task.status, "waiting_confirmation");
      task.status = "waiting_confirmation";
    });
  }

  markCompleted(id: string, result: unknown): Task {
    return this.mutate(id, (task) => {
      this.assertTransition(task.status, "completed");
      task.status = "completed";
      task.result = result;
      task.completedAt = new Date().toISOString();
    });
  }

  markFailed(id: string, error: string): Task {
    return this.mutate(id, (task) => {
      this.assertTransition(task.status, "failed");
      task.status = "failed";
      task.error = error;
      task.completedAt = new Date().toISOString();
    });
  }

  markCancelled(id: string, reason?: string): Task {
    return this.mutate(id, (task) => {
      this.assertTransition(task.status, "cancelled");
      task.status = "cancelled";
      task.error = reason ?? "cancelled";
      task.completedAt = new Date().toISOString();
    });
  }
}
