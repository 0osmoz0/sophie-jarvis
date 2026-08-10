import fs from "node:fs/promises";
import path from "node:path";
import type {
  FileEntryObservation,
  FileObservation,
  FileObserverConfig,
} from "./types.js";

/**
 * FileObserver — READ ONLY, configured paths only.
 *
 * Default: paths = [] → observes nothing.
 * When paths are set, lists direct children via fs.readdir / fs.stat only.
 * Never deletes, moves, renames, or modifies files.
 * Never watches the whole disk.
 */
export class FileObserver {
  private paths: string[];

  constructor(config: FileObserverConfig = { paths: [] }) {
    this.paths = [...(config.paths ?? [])];
  }

  getConfiguredPaths(): string[] {
    return [...this.paths];
  }

  setPaths(paths: string[]): void {
    this.paths = [...paths];
  }

  async observe(): Promise<FileObservation> {
    const configuredPaths = [...this.paths];

    if (configuredPaths.length === 0) {
      return {
        availability: "available",
        reason: "No paths configured — FileObserver is idle by default (data minimization).",
        configuredPaths,
        entries: [],
      };
    }

    const entries: FileEntryObservation[] = [];
    const errors: string[] = [];

    for (const configured of configuredPaths) {
      const resolved = path.resolve(configured);
      try {
        const dirents = await fs.readdir(resolved, { withFileTypes: true });
        for (const dirent of dirents) {
          const full = path.join(resolved, dirent.name);
          let sizeBytes: number | null = null;
          let modifiedAt: string | null = null;
          try {
            const st = await fs.stat(full);
            sizeBytes = st.size;
            modifiedAt = st.mtime.toISOString();
          } catch {
            sizeBytes = null;
            modifiedAt = null;
          }
          entries.push({
            path: full,
            name: dirent.name,
            isDirectory: dirent.isDirectory(),
            sizeBytes,
            modifiedAt,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${resolved}: ${message}`);
      }
    }

    if (errors.length > 0 && entries.length === 0) {
      return {
        availability: "error",
        reason: errors.join("; "),
        configuredPaths,
        entries: [],
      };
    }

    return {
      availability: "available",
      reason: errors.length > 0 ? `Partial: ${errors.join("; ")}` : null,
      configuredPaths,
      entries,
    };
  }
}
