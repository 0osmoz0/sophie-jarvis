import type { RiskLevel } from "../permissions/RiskLevel.js";

/** Structured file operation error — never claim success on failure. */
export interface FileError {
  code: string;
  message: string;
}

export type FileResult<T> =
  | { success: true; data: T }
  | { success: false; error: FileError };

export type FileEntryType = "file" | "directory" | "symlink" | "other";

export interface FileListEntry {
  name: string;
  type: FileEntryType;
  size: number | null;
  modifiedAt: string | null;
}

export interface FileInfoData {
  name: string;
  path: string;
  type: FileEntryType;
  size: number | null;
  createdAt: string | null;
  modifiedAt: string | null;
  extension: string | null;
}

export type FileOperationName =
  | "list"
  | "info"
  | "copy"
  | "move"
  | "create"
  | "delete";

export interface DryRunPlan {
  operation: FileOperationName;
  source: string | null;
  destination: string | null;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  summary: string;
}

export interface FileAuditEntry {
  timestamp: string;
  taskId: string | null;
  toolId: string;
  operation: FileOperationName;
  source: string | null;
  destination: string | null;
  riskLevel: RiskLevel;
  confirmation: boolean;
  result: "success" | "denied" | "error" | "dry_run";
  errorCode?: string;
  /** Never stores file contents. */
}

/** Future-proof sink — Phase 3 uses memory only. */
export interface FileAuditSink {
  append(entry: FileAuditEntry): void;
  list(): readonly FileAuditEntry[];
}

export interface ResolvedPath {
  /** Absolute normalized path (logical). */
  absolute: string;
  /** Real path after symlink resolution when the path exists; otherwise null. */
  real: string | null;
  /** Parent directory real path (for create/copy destinations that do not exist yet). */
  parentReal: string | null;
}

export const FILE_ERROR_CODES = {
  DENIED: "PATH_DENIED",
  NOT_FOUND: "NOT_FOUND",
  EXISTS: "ALREADY_EXISTS",
  NOT_A_FILE: "NOT_A_FILE",
  NOT_A_DIRECTORY: "NOT_A_DIRECTORY",
  IS_DIRECTORY: "IS_DIRECTORY",
  INVALID_ARGS: "INVALID_ARGS",
  UNSUPPORTED: "UNSUPPORTED",
  IO: "IO_ERROR",
  TRAVERSAL: "PATH_TRAVERSAL",
  SYMLINK_ESCAPE: "SYMLINK_ESCAPE",
  BLOCKED: "BLOCKED_PATH",
} as const;
