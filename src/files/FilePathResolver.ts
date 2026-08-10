import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ResolvedPath } from "./types.js";

/**
 * FilePathResolver — normalize and validate paths.
 * Never trust LLM-supplied paths; always normalize then verify via FilePolicy.
 */
export class FilePathResolver {
  /** Expand ~, decode URI encodings once, normalize, reject null bytes. */
  normalizeInput(input: string): string {
    if (typeof input !== "string" || input.trim() === "") {
      throw new PathResolutionError("Path must be a non-empty string", "INVALID_ARGS");
    }
    if (input.includes("\0")) {
      throw new PathResolutionError("Path contains null byte", "INVALID_ARGS");
    }

    let raw = input.trim();

    // Decode a single layer of URI encoding (e.g. %2e%2e%2f → ../)
    if (/%[0-9a-fA-F]{2}/.test(raw)) {
      try {
        raw = decodeURIComponent(raw);
      } catch {
        throw new PathResolutionError("Invalid URI-encoded path", "INVALID_ARGS");
      }
    }

    if (raw.includes("\0")) {
      throw new PathResolutionError("Path contains null byte after decode", "INVALID_ARGS");
    }

    if (raw === "~") {
      raw = os.homedir();
    } else if (raw.startsWith("~/") || raw.startsWith("~\\")) {
      raw = path.join(os.homedir(), raw.slice(2));
    }

    // Reject URL-like schemes
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) && !path.win32.isAbsolute(raw)) {
      // Allow only drive letters on win; on POSIX reject file:, http:, etc.
      if (!/^[a-zA-Z]:[\\/]/.test(raw)) {
        throw new PathResolutionError("URL/scheme paths are not allowed", "INVALID_ARGS");
      }
    }

    return path.normalize(raw);
  }

  toAbsolute(normalized: string, cwd: string = process.cwd()): string {
    return path.resolve(cwd, normalized);
  }

  /**
   * Resolve real path information.
   * For existing paths: realpath of the target.
   * For non-existing paths: realpath of the nearest existing ancestor + remainder.
   */
  async resolve(input: string, cwd?: string): Promise<ResolvedPath> {
    const normalized = this.normalizeInput(input);
    const absolute = this.toAbsolute(normalized, cwd);

    let real: string | null = null;
    let parentReal: string | null = null;

    try {
      real = await fs.realpath(absolute);
    } catch {
      real = null;
    }

    // Walk up to find an existing ancestor for parentReal
    let cursor = path.dirname(absolute);
    for (let i = 0; i < 64; i++) {
      try {
        parentReal = await fs.realpath(cursor);
        break;
      } catch {
        const next = path.dirname(cursor);
        if (next === cursor) break;
        cursor = next;
      }
    }

    return { absolute, real, parentReal };
  }

  /**
   * Candidate path used for policy checks:
   * prefer real path when present; otherwise absolute (for yet-to-be-created files,
   * also ensure the parent real stays inside the sandbox via policy).
   */
  policySubject(resolved: ResolvedPath): string {
    return resolved.real ?? resolved.absolute;
  }
}

export class PathResolutionError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "PathResolutionError";
    this.code = code;
  }
}
