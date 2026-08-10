import type {
  JarvisContextSnapshot,
  SecurityState,
  Task,
  UserPresence,
} from "./types.js";

/**
 * Read-only Context — what JARVIS currently "knows".
 *
 * Phase 1: demo / placeholder values only.
 * NO real surveillance of apps, presence, or security.
 */
export class Context {
  private _timestamp: string;
  private _userPresence: UserPresence;
  private _activeApplication: string | null | "unknown";
  private _securityState: SecurityState;
  private _currentTask: Task | null;

  constructor(initial?: Partial<JarvisContextSnapshot>) {
    this._timestamp = initial?.timestamp ?? new Date().toISOString();
    this._userPresence = initial?.userPresence ?? "unknown";
    this._activeApplication = initial?.activeApplication ?? "unknown";
    this._securityState = initial?.securityState ?? "nominal";
    this._currentTask = initial?.currentTask ?? null;
  }

  get timestamp(): string {
    return this._timestamp;
  }

  get userPresence(): UserPresence {
    return this._userPresence;
  }

  get activeApplication(): string | null | "unknown" {
    return this._activeApplication;
  }

  get securityState(): SecurityState {
    return this._securityState;
  }

  get currentTask(): Task | null {
    return this._currentTask;
  }

  /** Internal update used by JarvisCore only — not public mutation API. */
  _setCurrentTask(task: Task | null): void {
    this._currentTask = task;
    this._timestamp = new Date().toISOString();
  }

  /** Demo helper — does not observe the real environment. */
  _setDemoValues(partial: Partial<JarvisContextSnapshot>): void {
    if (partial.timestamp !== undefined) this._timestamp = partial.timestamp;
    if (partial.userPresence !== undefined)
      this._userPresence = partial.userPresence;
    if (partial.activeApplication !== undefined)
      this._activeApplication = partial.activeApplication;
    if (partial.securityState !== undefined)
      this._securityState = partial.securityState;
    if (partial.currentTask !== undefined)
      this._currentTask = partial.currentTask;
    this._timestamp = new Date().toISOString();
  }

  snapshot(): JarvisContextSnapshot {
    return {
      timestamp: this._timestamp,
      userPresence: this._userPresence,
      activeApplication: this._activeApplication,
      securityState: this._securityState,
      currentTask: this._currentTask,
    };
  }
}
