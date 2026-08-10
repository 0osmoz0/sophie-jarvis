import fs from "node:fs/promises";
import path from "node:path";
import { RiskLevel } from "../permissions/RiskLevel.js";
import { FilePathResolver } from "./FilePathResolver.js";
import { FilePolicy } from "./FilePolicy.js";
import { MemoryFileAuditLog } from "./FileAuditLog.js";
import type { FileAuditSink } from "./types.js";
import {
  FILE_ERROR_CODES,
  type DryRunPlan,
  type FileEntryType,
  type FileInfoData,
  type FileListEntry,
  type FileOperationName,
  type FileResult,
} from "./types.js";

const MAX_RECURSIVE_DEPTH = 3;

/** Extensions / basenames refused for file.create in Phase 3. */
const CREATE_BLOCKED_EXTENSIONS = new Set([
  ".sh",
  ".bash",
  ".zsh",
  ".command",
  ".bat",
  ".cmd",
  ".ps1",
  ".exe",
  ".app",
  ".dmg",
  ".pkg",
  ".dylib",
  ".so",
  ".plist",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".py",
  ".rb",
  ".php",
]);

const CREATE_BLOCKED_NAMES = new Set([
  "autorun.inf",
  ".ds_store",
]);

export interface FileServiceOptions {
  policy?: FilePolicy;
  resolver?: FilePathResolver;
  audit?: FileAuditSink;
}

export interface FileListArgs {
  path: string;
  recursive?: boolean;
  maxDepth?: number;
}

export interface FileInfoArgs {
  path: string;
}

export interface FileCopyArgs {
  source: string;
  destination: string;
  overwrite?: boolean;
  dryRun?: boolean;
  taskId?: string | null;
  confirmed?: boolean;
}

export interface FileMoveArgs {
  source: string;
  destination: string;
  overwrite?: boolean;
  dryRun?: boolean;
  taskId?: string | null;
  confirmed?: boolean;
}

export interface FileCreateArgs {
  path: string;
  content?: string;
  overwrite?: boolean;
  dryRun?: boolean;
  taskId?: string | null;
  confirmed?: boolean;
}

export interface FileDeleteArgs {
  path: string;
  recursive?: boolean;
  dryRun?: boolean;
  taskId?: string | null;
  confirmed?: boolean;
}

/**
 * FileService — sole module allowed to perform mutating fs operations.
 * All paths go through FilePathResolver + FilePolicy first.
 */
export class FileService {
  readonly policy: FilePolicy;
  readonly resolver: FilePathResolver;
  readonly audit: FileAuditSink;

  constructor(options: FileServiceOptions = {}) {
    this.resolver = options.resolver ?? new FilePathResolver();
    this.policy = options.policy ?? new FilePolicy(this.resolver);
    this.audit = options.audit ?? new MemoryFileAuditLog();
  }

  setAllowedPaths(paths: string[]): void {
    this.policy.setAllowedPaths(paths);
  }

  // ─── Dry-run / plan (no mutation) ───────────────────────────────────────

  plan(
    operation: FileOperationName,
    args: {
      source?: string | null;
      destination?: string | null;
      path?: string | null;
    },
  ): DryRunPlan {
    const risk = riskFor(operation);
    const source =
      args.source ??
      (operation === "list" ||
      operation === "info" ||
      operation === "create" ||
      operation === "delete"
        ? (args.path ?? null)
        : null);
    const destination = args.destination ?? null;
    const requiresConfirmation =
      risk === RiskLevel.MEDIUM || risk === RiskLevel.HIGH;

    let summary: string;
    switch (operation) {
      case "list":
        summary = `Lister le dossier ${source ?? "?"}.`;
        break;
      case "info":
        summary = `Inspecter les métadonnées de ${source ?? "?"}.`;
        break;
      case "copy":
        summary = `Je vais copier ${source ?? "?"} vers ${destination ?? "?"}.`;
        break;
      case "move":
        summary = `Je vais déplacer ${source ?? "?"} vers ${destination ?? "?"}.`;
        break;
      case "create":
        summary = `Je vais créer le fichier texte ${source ?? "?"}.`;
        break;
      case "delete":
        summary = `Je vais supprimer le fichier ${source ?? "?"}.`;
        break;
    }

    return {
      operation,
      source,
      destination,
      riskLevel: risk,
      requiresConfirmation,
      summary,
    };
  }

  // ─── list ───────────────────────────────────────────────────────────────

  async list(args: FileListArgs): Promise<FileResult<{ path: string; entries: FileListEntry[] }>> {
    const decision = await this.policy.check(args.path);
    if (!decision.allowed) {
      return this.fail("list", FILE_ERROR_CODES.DENIED, decision.reason ?? "Denied", {
        source: args.path,
      });
    }

    const target = decision.resolved.real ?? decision.resolved.absolute;
    let st;
    try {
      st = await fs.stat(target);
    } catch {
      return this.fail("list", FILE_ERROR_CODES.NOT_FOUND, `Path not found: ${args.path}`, {
        source: args.path,
      });
    }
    if (!st.isDirectory()) {
      return this.fail("list", FILE_ERROR_CODES.NOT_A_DIRECTORY, "Path is not a directory", {
        source: target,
      });
    }

    const recursive = args.recursive === true;
    const maxDepth = Math.min(
      Math.max(0, args.maxDepth ?? MAX_RECURSIVE_DEPTH),
      MAX_RECURSIVE_DEPTH,
    );

    try {
      const entries = await this.collectEntries(target, recursive ? maxDepth : 0, 0);
      this.record({
        toolId: "file.list",
        operation: "list",
        source: target,
        destination: null,
        riskLevel: RiskLevel.LOW,
        confirmation: false,
        result: "success",
      });
      return { success: true, data: { path: target, entries } };
    } catch (err) {
      return this.fail("list", FILE_ERROR_CODES.IO, errMessage(err), { source: target });
    }
  }

  // ─── info ───────────────────────────────────────────────────────────────

  async info(args: FileInfoArgs): Promise<FileResult<FileInfoData>> {
    const decision = await this.policy.check(args.path);
    if (!decision.allowed) {
      return this.fail("info", FILE_ERROR_CODES.DENIED, decision.reason ?? "Denied", {
        source: args.path,
      });
    }

    const target = decision.resolved.real ?? decision.resolved.absolute;
    try {
      const st = await fs.stat(target);
      const data: FileInfoData = {
        name: path.basename(target),
        path: target,
        type: entryTypeFromStat(st),
        size: st.size,
        createdAt: st.birthtime?.toISOString?.() ?? null,
        modifiedAt: st.mtime.toISOString(),
        extension: st.isFile() ? extOf(target) : null,
      };
      this.record({
        toolId: "file.info",
        operation: "info",
        source: target,
        destination: null,
        riskLevel: RiskLevel.LOW,
        confirmation: false,
        result: "success",
      });
      return { success: true, data };
    } catch {
      return this.fail("info", FILE_ERROR_CODES.NOT_FOUND, `Path not found: ${args.path}`, {
        source: args.path,
      });
    }
  }

  // ─── copy ───────────────────────────────────────────────────────────────

  async copy(args: FileCopyArgs): Promise<FileResult<{ source: string; destination: string } | DryRunPlan>> {
    if (args.dryRun === true) {
      const plan = this.plan("copy", {
        source: args.source,
        destination: args.destination,
      });
      this.record({
        toolId: "file.copy",
        operation: "copy",
        source: args.source,
        destination: args.destination,
        riskLevel: RiskLevel.MEDIUM,
        confirmation: false,
        result: "dry_run",
        taskId: args.taskId,
      });
      return { success: true, data: plan };
    }

    const srcDec = await this.policy.check(args.source);
    if (!srcDec.allowed) {
      return this.fail("copy", srcDec.code ?? FILE_ERROR_CODES.DENIED, srcDec.reason ?? "Source denied", {
        source: args.source,
        destination: args.destination,
        toolId: "file.copy",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }
    const dstDec = await this.policy.check(args.destination);
    if (!dstDec.allowed) {
      return this.fail("copy", dstDec.code ?? FILE_ERROR_CODES.DENIED, dstDec.reason ?? "Destination denied", {
        source: args.source,
        destination: args.destination,
        toolId: "file.copy",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    const src = srcDec.resolved.real ?? srcDec.resolved.absolute;
    const dst = dstDec.resolved.absolute;

    try {
      const srcStat = await fs.stat(src);
      if (!srcStat.isFile()) {
        return this.fail("copy", FILE_ERROR_CODES.NOT_A_FILE, "Source must be a file in Phase 3", {
          source: src,
          destination: dst,
          toolId: "file.copy",
          risk: RiskLevel.MEDIUM,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
        });
      }
    } catch {
      return this.fail("copy", FILE_ERROR_CODES.NOT_FOUND, "Source does not exist", {
        source: src,
        destination: dst,
        toolId: "file.copy",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    const destExists = await exists(dst);
    if (destExists && args.overwrite !== true) {
      return this.fail("copy", FILE_ERROR_CODES.EXISTS, "Destination already exists (no silent overwrite)", {
        source: src,
        destination: dst,
        toolId: "file.copy",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    // Re-check destination real path after potential overwrite target
    const dstRecheck = await this.policy.check(dst);
    if (!dstRecheck.allowed) {
      return this.fail("copy", FILE_ERROR_CODES.DENIED, dstRecheck.reason ?? "Destination denied", {
        source: src,
        destination: dst,
        toolId: "file.copy",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    try {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      // Ensure mkdir stayed in sandbox
      const parentCheck = await this.policy.check(path.dirname(dst));
      if (!parentCheck.allowed) {
        return this.fail("copy", FILE_ERROR_CODES.DENIED, "Destination parent not allowed", {
          source: src,
          destination: dst,
          toolId: "file.copy",
          risk: RiskLevel.MEDIUM,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
        });
      }
      await fs.copyFile(src, dst);
      this.record({
        toolId: "file.copy",
        operation: "copy",
        source: src,
        destination: dst,
        riskLevel: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        result: "success",
        taskId: args.taskId,
      });
      return { success: true, data: { source: src, destination: dst } };
    } catch (err) {
      return this.fail("copy", FILE_ERROR_CODES.IO, errMessage(err), {
        source: src,
        destination: dst,
        toolId: "file.copy",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }
  }

  // ─── move ───────────────────────────────────────────────────────────────

  async move(args: FileMoveArgs): Promise<FileResult<{ source: string; destination: string } | DryRunPlan>> {
    if (args.dryRun === true) {
      const plan = this.plan("move", {
        source: args.source,
        destination: args.destination,
      });
      this.record({
        toolId: "file.move",
        operation: "move",
        source: args.source,
        destination: args.destination,
        riskLevel: RiskLevel.MEDIUM,
        confirmation: false,
        result: "dry_run",
        taskId: args.taskId,
      });
      return { success: true, data: plan };
    }

    const srcDec = await this.policy.check(args.source);
    if (!srcDec.allowed) {
      return this.fail("move", srcDec.code ?? FILE_ERROR_CODES.DENIED, srcDec.reason ?? "Source denied", {
        source: args.source,
        destination: args.destination,
        toolId: "file.move",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }
    const dstDec = await this.policy.check(args.destination);
    if (!dstDec.allowed) {
      return this.fail("move", dstDec.code ?? FILE_ERROR_CODES.DENIED, dstDec.reason ?? "Destination denied", {
        source: args.source,
        destination: args.destination,
        toolId: "file.move",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    const src = srcDec.resolved.real ?? srcDec.resolved.absolute;
    const dst = dstDec.resolved.absolute;

    try {
      const srcStat = await fs.stat(src);
      if (!srcStat.isFile()) {
        return this.fail("move", FILE_ERROR_CODES.NOT_A_FILE, "Source must be a file in Phase 3", {
          source: src,
          destination: dst,
          toolId: "file.move",
          risk: RiskLevel.MEDIUM,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
        });
      }
    } catch {
      return this.fail("move", FILE_ERROR_CODES.NOT_FOUND, "Source does not exist", {
        source: src,
        destination: dst,
        toolId: "file.move",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    if ((await exists(dst)) && args.overwrite !== true) {
      return this.fail("move", FILE_ERROR_CODES.EXISTS, "Destination already exists (no silent overwrite)", {
        source: src,
        destination: dst,
        toolId: "file.move",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    try {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      const parentCheck = await this.policy.check(path.dirname(dst));
      if (!parentCheck.allowed) {
        return this.fail("move", FILE_ERROR_CODES.DENIED, "Destination parent not allowed", {
          source: src,
          destination: dst,
          toolId: "file.move",
          risk: RiskLevel.MEDIUM,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
        });
      }
      await fs.rename(src, dst);
      this.record({
        toolId: "file.move",
        operation: "move",
        source: src,
        destination: dst,
        riskLevel: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        result: "success",
        taskId: args.taskId,
      });
      return { success: true, data: { source: src, destination: dst } };
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : null;
      if (code !== "EXDEV") {
        return this.fail("move", FILE_ERROR_CODES.IO, errMessage(err), {
          source: src,
          destination: dst,
          toolId: "file.move",
          risk: RiskLevel.MEDIUM,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
        });
      }
      // Cross-device rename fallback: copy + unlink (paths already policy-checked)
      try {
        await fs.copyFile(src, dst);
        await fs.unlink(src);
        this.record({
          toolId: "file.move",
          operation: "move",
          source: src,
          destination: dst,
          riskLevel: RiskLevel.MEDIUM,
          confirmation: !!args.confirmed,
          result: "success",
          taskId: args.taskId,
        });
        return { success: true, data: { source: src, destination: dst } };
      } catch (err2) {
        return this.fail("move", FILE_ERROR_CODES.IO, errMessage(err2), {
          source: src,
          destination: dst,
          toolId: "file.move",
          risk: RiskLevel.MEDIUM,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
        });
      }
    }
  }

  // ─── create ─────────────────────────────────────────────────────────────

  async create(args: FileCreateArgs): Promise<FileResult<{ path: string } | DryRunPlan>> {
    if (args.dryRun === true) {
      const plan = this.plan("create", { path: args.path });
      this.record({
        toolId: "file.create",
        operation: "create",
        source: args.path,
        destination: null,
        riskLevel: RiskLevel.MEDIUM,
        confirmation: false,
        result: "dry_run",
        taskId: args.taskId,
      });
      return { success: true, data: plan };
    }

    const decision = await this.policy.check(args.path);
    if (!decision.allowed) {
      return this.fail("create", decision.code ?? FILE_ERROR_CODES.DENIED, decision.reason ?? "Denied", {
        source: args.path,
        toolId: "file.create",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    const target = decision.resolved.absolute;
    const base = path.basename(target).toLowerCase();
    const ext = path.extname(base).toLowerCase();

    if (CREATE_BLOCKED_NAMES.has(base) || CREATE_BLOCKED_EXTENSIONS.has(ext)) {
      return this.fail(
        "create",
        FILE_ERROR_CODES.UNSUPPORTED,
        "Phase 3 file.create is limited to simple text files (blocked extension/name).",
        {
          source: target,
          toolId: "file.create",
          risk: RiskLevel.MEDIUM,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
        },
      );
    }

    // Prefer .txt or no extension for text; allow .md .csv .json .log .txt
    const allowedExt = new Set(["", ".txt", ".md", ".csv", ".json", ".log"]);
    if (!allowedExt.has(ext)) {
      return this.fail(
        "create",
        FILE_ERROR_CODES.UNSUPPORTED,
        "Phase 3 file.create allows only simple text extensions: .txt .md .csv .json .log or none.",
        {
          source: target,
          toolId: "file.create",
          risk: RiskLevel.MEDIUM,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
        },
      );
    }

    const content = args.content ?? "";
    if (typeof content !== "string") {
      return this.fail("create", FILE_ERROR_CODES.INVALID_ARGS, "content must be a string", {
        source: target,
        toolId: "file.create",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }
    if (content.startsWith("#!")) {
      return this.fail("create", FILE_ERROR_CODES.UNSUPPORTED, "Shebang scripts are not allowed", {
        source: target,
        toolId: "file.create",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    if ((await exists(target)) && args.overwrite !== true) {
      return this.fail("create", FILE_ERROR_CODES.EXISTS, "File already exists (no silent overwrite)", {
        source: target,
        toolId: "file.create",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      const parentCheck = await this.policy.check(path.dirname(target));
      if (!parentCheck.allowed) {
        return this.fail("create", FILE_ERROR_CODES.DENIED, "Parent directory not allowed", {
          source: target,
          toolId: "file.create",
          risk: RiskLevel.MEDIUM,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
        });
      }
      // write atomically via temp in same directory then rename
      const tmp = path.join(
        path.dirname(target),
        `.jarvis-${process.pid}-${Date.now()}.tmp`,
      );
      const tmpCheck = await this.policy.check(tmp);
      if (!tmpCheck.allowed) {
        return this.fail("create", FILE_ERROR_CODES.DENIED, "Temp path not allowed", {
          source: target,
          toolId: "file.create",
          risk: RiskLevel.MEDIUM,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
        });
      }
      await fs.writeFile(tmp, content, { encoding: "utf8", flag: "w" });
      await fs.rename(tmp, target);
      this.record({
        toolId: "file.create",
        operation: "create",
        source: target,
        destination: null,
        riskLevel: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        result: "success",
        taskId: args.taskId,
      });
      return { success: true, data: { path: target } };
    } catch (err) {
      return this.fail("create", FILE_ERROR_CODES.IO, errMessage(err), {
        source: target,
        toolId: "file.create",
        risk: RiskLevel.MEDIUM,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }
  }

  // ─── delete ─────────────────────────────────────────────────────────────

  async delete(args: FileDeleteArgs): Promise<FileResult<{ path: string } | DryRunPlan>> {
    if (args.dryRun === true) {
      const plan = this.plan("delete", { path: args.path });
      this.record({
        toolId: "file.delete",
        operation: "delete",
        source: args.path,
        destination: null,
        riskLevel: RiskLevel.HIGH,
        confirmation: false,
        result: "dry_run",
        taskId: args.taskId,
      });
      return { success: true, data: plan };
    }

    if (args.recursive === true) {
      return this.fail("delete", FILE_ERROR_CODES.UNSUPPORTED, "Recursive delete is not allowed in Phase 3", {
        source: args.path,
        toolId: "file.delete",
        risk: RiskLevel.HIGH,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    const decision = await this.policy.check(args.path);
    if (!decision.allowed) {
      return this.fail("delete", decision.code ?? FILE_ERROR_CODES.DENIED, decision.reason ?? "Denied", {
        source: args.path,
        toolId: "file.delete",
        risk: RiskLevel.HIGH,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    const target = decision.resolved.real ?? decision.resolved.absolute;

    let st;
    try {
      st = await fs.lstat(target);
    } catch {
      return this.fail("delete", FILE_ERROR_CODES.NOT_FOUND, "Path not found", {
        source: target,
        toolId: "file.delete",
        risk: RiskLevel.HIGH,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    if (st.isDirectory()) {
      return this.fail("delete", FILE_ERROR_CODES.IS_DIRECTORY, "Directory delete is not allowed in Phase 3", {
        source: target,
        toolId: "file.delete",
        risk: RiskLevel.HIGH,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    if (!st.isFile() && !st.isSymbolicLink()) {
      return this.fail("delete", FILE_ERROR_CODES.NOT_A_FILE, "Only regular files (or links to files) may be deleted", {
        source: target,
        toolId: "file.delete",
        risk: RiskLevel.HIGH,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }

    // If symlink, ensure target is still in sandbox (already checked via realpath in policy)
    if (st.isSymbolicLink()) {
      const escapeCheck = await this.policy.assertNoSymlinkEscape(target);
      if (!escapeCheck.allowed) {
        return this.fail("delete", FILE_ERROR_CODES.SYMLINK_ESCAPE, escapeCheck.reason ?? "Symlink escape", {
          source: target,
          toolId: "file.delete",
          risk: RiskLevel.HIGH,
          confirmation: !!args.confirmed,
          taskId: args.taskId,
        });
      }
    }

    try {
      await fs.unlink(target);
      this.record({
        toolId: "file.delete",
        operation: "delete",
        source: target,
        destination: null,
        riskLevel: RiskLevel.HIGH,
        confirmation: !!args.confirmed,
        result: "success",
        taskId: args.taskId,
      });
      return { success: true, data: { path: target } };
    } catch (err) {
      return this.fail("delete", FILE_ERROR_CODES.IO, errMessage(err), {
        source: target,
        toolId: "file.delete",
        risk: RiskLevel.HIGH,
        confirmation: !!args.confirmed,
        taskId: args.taskId,
      });
    }
  }

  // ─── helpers ────────────────────────────────────────────────────────────

  private async collectEntries(
    dir: string,
    maxDepth: number,
    depth: number,
  ): Promise<FileListEntry[]> {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const out: FileListEntry[] = [];
    for (const d of dirents) {
      const full = path.join(dir, d.name);
      // Skip entries that escape via symlink
      const check = await this.policy.check(full);
      if (!check.allowed) continue;

      let size: number | null = null;
      let modifiedAt: string | null = null;
      let type: FileEntryType = "other";
      try {
        const st = await fs.lstat(full);
        type = entryTypeFromStat(st);
        size = st.isFile() ? st.size : null;
        modifiedAt = st.mtime.toISOString();
      } catch {
        /* skip metadata */
      }
      out.push({ name: d.name, type, size, modifiedAt });

      if (maxDepth > 0 && depth < maxDepth && d.isDirectory() && !d.isSymbolicLink()) {
        const nested = await this.collectEntries(full, maxDepth, depth + 1);
        for (const n of nested) {
          out.push({
            ...n,
            name: path.join(d.name, n.name),
          });
        }
      }
    }
    return out;
  }

  private fail(
    operation: FileOperationName,
    code: string,
    message: string,
    meta: {
      source?: string | null;
      destination?: string | null;
      toolId?: string;
      risk?: RiskLevel;
      confirmation?: boolean;
      taskId?: string | null;
    } = {},
  ): FileResult<never> {
    this.record({
      toolId: meta.toolId ?? `file.${operation}`,
      operation,
      source: meta.source ?? null,
      destination: meta.destination ?? null,
      riskLevel: meta.risk ?? riskFor(operation),
      confirmation: meta.confirmation ?? false,
      result: code === FILE_ERROR_CODES.DENIED || code === FILE_ERROR_CODES.BLOCKED || code === FILE_ERROR_CODES.SYMLINK_ESCAPE || code === FILE_ERROR_CODES.TRAVERSAL
        ? "denied"
        : "error",
      errorCode: code,
      taskId: meta.taskId,
    });
    return { success: false, error: { code, message } };
  }

  private record(partial: {
    toolId: string;
    operation: FileOperationName;
    source: string | null;
    destination: string | null;
    riskLevel: RiskLevel;
    confirmation: boolean;
    result: "success" | "denied" | "error" | "dry_run";
    errorCode?: string;
    taskId?: string | null;
  }): void {
    this.audit.append({
      timestamp: new Date().toISOString(),
      taskId: partial.taskId ?? null,
      toolId: partial.toolId,
      operation: partial.operation,
      source: partial.source,
      destination: partial.destination,
      riskLevel: partial.riskLevel,
      confirmation: partial.confirmation,
      result: partial.result,
      errorCode: partial.errorCode,
    });
  }
}

function riskFor(operation: FileOperationName): RiskLevel {
  switch (operation) {
    case "list":
    case "info":
      return RiskLevel.LOW;
    case "copy":
    case "move":
    case "create":
      return RiskLevel.MEDIUM;
    case "delete":
      return RiskLevel.HIGH;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function entryTypeFromStat(st: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): FileEntryType {
  if (st.isSymbolicLink()) return "symlink";
  if (st.isDirectory()) return "directory";
  if (st.isFile()) return "file";
  return "other";
}

function extOf(p: string): string | null {
  const e = path.extname(p);
  return e || null;
}
