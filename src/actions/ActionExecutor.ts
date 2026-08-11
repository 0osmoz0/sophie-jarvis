import type { FileService } from "../files/FileService.js";
import type { ApplicationService } from "../applications/ApplicationService.js";
import type {
  ActionPlan,
  ActionResult,
  ActionRollbackInfo,
  AppClosePayload,
  AppOpenPayload,
  FileCopyPayload,
  FileCreatePayload,
  FileDeletePayload,
  FileMovePayload,
} from "./types.js";
import { ACTION_ERROR_CODES } from "./types.js";

export interface ActionExecutorDeps {
  files: FileService;
  applications: ApplicationService;
  /** Default execution timeout in ms. */
  timeoutMs?: number;
}

/**
 * ActionExecutor — delegates only to FileService / ApplicationService.
 * No direct node:fs, no native macOS APIs, no shell.
 */
export class ActionExecutor {
  private readonly files: FileService;
  private readonly applications: ApplicationService;
  private readonly timeoutMs: number;
  /** Destinations created by FILE_COPY in this process (for optional rollback). */
  private readonly copyCreated = new Map<string, string>();

  constructor(deps: ActionExecutorDeps) {
    this.files = deps.files;
    this.applications = deps.applications;
    this.timeoutMs = deps.timeoutMs ?? 30_000;
  }

  getTimeoutMs(): number {
    return this.timeoutMs;
  }

  async execute(
    plan: ActionPlan,
    options?: { dryRun?: boolean; timeoutMs?: number },
  ): Promise<ActionResult> {
    const dryRun = options?.dryRun === true || plan.dryRun === true;
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;

    const work = this.dispatch(plan, dryRun);
    return withTimeout(work, timeoutMs);
  }

  rollbackInfo(plan: ActionPlan): ActionRollbackInfo {
    switch (plan.actionType) {
      case "FILE_COPY": {
        const dest = (plan.payload as FileCopyPayload).destination;
        if (this.copyCreated.get(plan.taskId) === dest) {
          return {
            availability: "AVAILABLE",
            reason:
              "May delete destination created by this FILE_COPY if still unchanged.",
          };
        }
        return {
          availability: "UNAVAILABLE",
          reason: "No tracked copy destination for this task.",
        };
      }
      case "FILE_MOVE":
        return {
          availability: "UNAVAILABLE",
          reason:
            "Move rollback only if source/destination remain known and unchanged — not automated in Phase 8.",
        };
      case "FILE_DELETE":
        return {
          availability: "UNSUPPORTED",
          reason: "FILE_DELETE has no automatic rollback.",
        };
      case "FILE_CREATE":
        return {
          availability: "UNAVAILABLE",
          reason: "Create rollback not automated in Phase 8.",
        };
      case "APP_OPEN":
        return {
          availability: "UNAVAILABLE",
          reason:
            "Rollback would require an explicit authorized close — not automatic.",
        };
      case "APP_CLOSE":
        return {
          availability: "UNSUPPORTED",
          reason: "APP_CLOSE does not auto-reopen applications.",
        };
    }
  }

  async rollback(plan: ActionPlan): Promise<ActionResult> {
    const info = this.rollbackInfo(plan);
    if (info.availability !== "AVAILABLE") {
      return {
        success: false,
        error: {
          code: ACTION_ERROR_CODES.ROLLBACK_UNAVAILABLE,
          message: info.reason,
        },
      };
    }
    if (plan.actionType === "FILE_COPY") {
      const dest = this.copyCreated.get(plan.taskId);
      if (!dest) {
        return {
          success: false,
          error: {
            code: ACTION_ERROR_CODES.ROLLBACK_UNAVAILABLE,
            message: "Copy destination not tracked",
          },
        };
      }
      const del = await this.files.delete({
        path: dest,
        confirmed: true,
        taskId: plan.taskId,
      });
      if (!del.success) {
        return {
          success: false,
          error: {
            code: del.error.code,
            message: del.error.message,
          },
        };
      }
      this.copyCreated.delete(plan.taskId);
      return { success: true, data: { rolledBack: true, path: dest } };
    }
    return {
      success: false,
      error: {
        code: ACTION_ERROR_CODES.ROLLBACK_UNAVAILABLE,
        message: "Rollback unavailable",
      },
    };
  }

  private async dispatch(
    plan: ActionPlan,
    dryRun: boolean,
  ): Promise<ActionResult> {
    switch (plan.actionType) {
      case "FILE_COPY": {
        const p = plan.payload as FileCopyPayload;
        const r = await this.files.copy({
          source: p.source,
          destination: p.destination,
          overwrite: p.overwrite,
          dryRun,
          confirmed: true,
          taskId: plan.taskId,
        });
        if (!r.success) {
          return {
            success: false,
            error: { code: r.error.code, message: r.error.message },
          };
        }
        if (!dryRun) {
          this.copyCreated.set(plan.taskId, p.destination);
        }
        return { success: true, data: r.data };
      }
      case "FILE_MOVE": {
        const p = plan.payload as FileMovePayload;
        const r = await this.files.move({
          source: p.source,
          destination: p.destination,
          overwrite: p.overwrite,
          dryRun,
          confirmed: true,
          taskId: plan.taskId,
        });
        if (!r.success) {
          return {
            success: false,
            error: { code: r.error.code, message: r.error.message },
          };
        }
        return { success: true, data: r.data };
      }
      case "FILE_CREATE": {
        const p = plan.payload as FileCreatePayload;
        const r = await this.files.create({
          path: p.path,
          content: p.content,
          overwrite: p.overwrite,
          dryRun,
          confirmed: true,
          taskId: plan.taskId,
        });
        if (!r.success) {
          return {
            success: false,
            error: { code: r.error.code, message: r.error.message },
          };
        }
        return { success: true, data: r.data };
      }
      case "FILE_DELETE": {
        const p = plan.payload as FileDeletePayload;
        const r = await this.files.delete({
          path: p.path,
          dryRun,
          confirmed: true,
          taskId: plan.taskId,
        });
        if (!r.success) {
          return {
            success: false,
            error: { code: r.error.code, message: r.error.message },
          };
        }
        return { success: true, data: r.data };
      }
      case "APP_OPEN": {
        if (dryRun) {
          return {
            success: true,
            data: {
              dryRun: true,
              action: "APP_OPEN",
              applicationId: (plan.payload as AppOpenPayload).applicationId,
            },
          };
        }
        const p = plan.payload as AppOpenPayload;
        let r = await this.applications.open({
          id: p.applicationId,
          confirmed: true,
          taskId: plan.taskId,
        });
        if (!r.success) {
          r = await this.applications.open({
            name: p.applicationId,
            confirmed: true,
            taskId: plan.taskId,
          });
        }
        if (!r.success) {
          return {
            success: false,
            error: { code: r.error.code, message: r.error.message },
          };
        }
        return { success: true, data: r.data };
      }
      case "APP_CLOSE": {
        if (dryRun) {
          return {
            success: true,
            data: {
              dryRun: true,
              action: "APP_CLOSE",
              applicationId: (plan.payload as AppClosePayload).applicationId,
            },
          };
        }
        const p = plan.payload as AppClosePayload;
        let r = await this.applications.close({
          id: p.applicationId,
          confirmed: true,
          taskId: plan.taskId,
        });
        if (!r.success) {
          r = await this.applications.close({
            name: p.applicationId,
            confirmed: true,
            taskId: plan.taskId,
          });
        }
        if (!r.success) {
          return {
            success: false,
            error: { code: r.error.code, message: r.error.message },
          };
        }
        return { success: true, data: r.data };
      }
    }
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Object.assign(new Error("Action execution timed out"), {
              code: ACTION_ERROR_CODES.TIMEOUT,
            }),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
