export type {
  FileError,
  FileResult,
  FileEntryType,
  FileListEntry,
  FileInfoData,
  FileOperationName,
  DryRunPlan,
  FileAuditEntry,
  FileAuditSink,
  ResolvedPath,
} from "./types.js";
export { FILE_ERROR_CODES } from "./types.js";

export { FilePathResolver, PathResolutionError } from "./FilePathResolver.js";
export { FilePolicy } from "./FilePolicy.js";
export type { PathPolicyDecision } from "./FilePolicy.js";
export { MemoryFileAuditLog } from "./FileAuditLog.js";
export { FileService } from "./FileService.js";
export type {
  FileServiceOptions,
  FileListArgs,
  FileInfoArgs,
  FileCopyArgs,
  FileMoveArgs,
  FileCreateArgs,
  FileDeleteArgs,
} from "./FileService.js";
