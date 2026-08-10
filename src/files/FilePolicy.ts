import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FilePathResolver,
  PathResolutionError,
} from "./FilePathResolver.js";
import type { ResolvedPath } from "./types.js";
import { FILE_ERROR_CODES } from "./types.js";

/**
 * Hard-blocked prefixes — never allow, even if mistakenly listed as allowed.
 * Checked after home expansion / normalization.
 */
function buildBlockedPrefixes(): string[] {
  const home = os.homedir();
  return [
    path.resolve("/System"),
    path.resolve("/Library"),
    path.resolve("/etc"),
    path.resolve("/private"),
    path.resolve("/var"),
    path.resolve(path.join(home, "Library")),
    path.resolve(path.join(home, ".ssh")),
    path.resolve(path.join(home, ".aws")),
    path.resolve(path.join(home, ".config")),
  ];
}

function isExactRoot(p: string): boolean {
  const n = path.resolve(p);
  return n === path.resolve("/") || n === path.parse(n).root;
}

function isInsideOrEqual(candidate: string, root: string): boolean {
  const c = path.resolve(candidate);
  const r = path.resolve(root);
  if (c === r) return true;
  const prefix = r.endsWith(path.sep) ? r : r + path.sep;
  return c.startsWith(prefix);
}

export interface PathPolicyDecision {
  allowed: boolean;
  reason?: string;
  code?: string;
  resolved: ResolvedPath;
}

/**
 * FilePolicy — decides whether a path is authorized.
 * Default: no user paths allowed.
 */
export class FilePolicy {
  private allowedRoots: string[] = [];
  private readonly resolver: FilePathResolver;
  private readonly blockedPrefixes: string[];

  constructor(resolver: FilePathResolver = new FilePathResolver()) {
    this.resolver = resolver;
    this.blockedPrefixes = buildBlockedPrefixes();
  }

  setAllowedPaths(paths: string[]): void {
    const roots: string[] = [];
    for (const p of paths) {
      const normalized = this.resolver.normalizeInput(p);
      const absolute = this.resolver.toAbsolute(normalized);
      roots.push(absolute);
    }
    this.allowedRoots = roots;
  }

  getAllowedPaths(): string[] {
    return [...this.allowedRoots];
  }

  clearAllowedPaths(): void {
    this.allowedRoots = [];
  }

  async check(inputPath: string): Promise<PathPolicyDecision> {
    let resolved: ResolvedPath;
    try {
      resolved = await this.resolver.resolve(inputPath);
    } catch (err) {
      if (err instanceof PathResolutionError) {
        return {
          allowed: false,
          reason: err.message,
          code: err.code,
          resolved: {
            absolute: inputPath,
            real: null,
            parentReal: null,
          },
        };
      }
      throw err;
    }

    return this.checkResolved(resolved);
  }

  checkResolved(resolved: ResolvedPath): PathPolicyDecision {
    if (this.allowedRoots.length === 0) {
      return {
        allowed: false,
        reason: "No allowed paths configured (default deny).",
        code: FILE_ERROR_CODES.DENIED,
        resolved,
      };
    }

    const subjects = new Set<string>();
    subjects.add(path.resolve(resolved.absolute));
    if (resolved.real) subjects.add(path.resolve(resolved.real));
    // For non-existing targets, parent must also stay in sandbox
    if (resolved.parentReal) subjects.add(path.resolve(resolved.parentReal));

    for (const subject of subjects) {
      if (isExactRoot(subject)) {
        return {
          allowed: false,
          reason: "Access to filesystem root is blocked.",
          code: FILE_ERROR_CODES.BLOCKED,
          resolved,
        };
      }
      for (const blocked of this.blockedPrefixes) {
        if (isInsideOrEqual(subject, blocked)) {
          return {
            allowed: false,
            reason: `Path is in a blocked system area: ${blocked}`,
            code: FILE_ERROR_CODES.BLOCKED,
            resolved,
          };
        }
      }
    }

    // Primary subject for allow-list: real path if exists, else absolute
    const primary = path.resolve(this.resolver.policySubject(resolved));
    const insideAllowed = this.allowedRoots.some((root) =>
      isInsideOrEqual(primary, root),
    );

    if (!insideAllowed) {
      return {
        allowed: false,
        reason: "Path is outside the allowed sandbox.",
        code: FILE_ERROR_CODES.DENIED,
        resolved,
      };
    }

    // Symlink escape: if real path exists, it must also be inside an allowed root
    if (resolved.real) {
      const realOk = this.allowedRoots.some((root) =>
        isInsideOrEqual(resolved.real!, root),
      );
      if (!realOk) {
        return {
          allowed: false,
          reason: "Symlink resolves outside the allowed sandbox.",
          code: FILE_ERROR_CODES.SYMLINK_ESCAPE,
          resolved,
        };
      }
    }

    // Parent of a yet-to-create file must be inside sandbox
    if (!resolved.real && resolved.parentReal) {
      const parentOk = this.allowedRoots.some((root) =>
        isInsideOrEqual(resolved.parentReal!, root),
      );
      if (!parentOk) {
        return {
          allowed: false,
          reason: "Parent directory resolves outside the allowed sandbox.",
          code: FILE_ERROR_CODES.SYMLINK_ESCAPE,
          resolved,
        };
      }
    }

    return { allowed: true, resolved };
  }

  /**
   * Extra check: ensure a symlink at `linkPath` does not escape when followed.
   */
  async assertNoSymlinkEscape(linkPath: string): Promise<PathPolicyDecision> {
    const decision = await this.check(linkPath);
    if (!decision.allowed) return decision;

    try {
      const st = await fs.lstat(decision.resolved.absolute);
      if (st.isSymbolicLink()) {
        const real = await fs.realpath(decision.resolved.absolute);
        const realResolved = await this.resolver.resolve(real);
        return this.checkResolved(realResolved);
      }
    } catch {
      // ignore — existence checked elsewhere
    }
    return decision;
  }
}
