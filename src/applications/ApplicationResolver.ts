import { ApplicationRegistry } from "./ApplicationRegistry.js";
import type { RegisteredApplication } from "./types.js";
import { APPLICATION_ERROR_CODES } from "./types.js";

export type ApplicationLookup =
  | { kind: "name"; value: string }
  | { kind: "bundleId"; value: string }
  | { kind: "path"; value: string }
  | { kind: "id"; value: string };

export type ResolveResult =
  | { ok: true; app: RegisteredApplication }
  | { ok: false; code: string; message: string };

/**
 * Characters / patterns that indicate command injection rather than an app name.
 * "Google Chrome && rm -rf ..." must be rejected as invalid input.
 */
const INVALID_NAME_PATTERN = /[;&|`$<>(){}[\]\\!\n\r]|&&|\|\||\$\(/;

const BUNDLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z0-9.-]+$/;

/**
 * ApplicationResolver — resolve explicit identity only.
 * Never treats input as a shell command.
 */
export class ApplicationResolver {
  constructor(private readonly registry: ApplicationRegistry) {}

  resolve(lookup: ApplicationLookup): ResolveResult {
    switch (lookup.kind) {
      case "name":
        return this.resolveName(lookup.value);
      case "bundleId":
        return this.resolveBundleId(lookup.value);
      case "path":
        return this.resolvePath(lookup.value);
      case "id":
        return this.resolveId(lookup.value);
      default: {
        const _exhaustive: never = lookup;
        return {
          ok: false,
          code: APPLICATION_ERROR_CODES.INVALID_INPUT,
          message: `Unknown lookup kind: ${String(_exhaustive)}`,
        };
      }
    }
  }

  /**
   * Build lookup from tool arguments (name | bundleId | path | id).
   * Exactly one identifier should be preferred; name is most common.
   */
  fromArgs(args: {
    name?: unknown;
    bundleId?: unknown;
    path?: unknown;
    id?: unknown;
  }): ResolveResult {
    const provided: ApplicationLookup[] = [];
    if (typeof args.id === "string" && args.id.trim()) {
      provided.push({ kind: "id", value: args.id.trim() });
    }
    if (typeof args.bundleId === "string" && args.bundleId.trim()) {
      provided.push({ kind: "bundleId", value: args.bundleId.trim() });
    }
    if (typeof args.path === "string" && args.path.trim()) {
      provided.push({ kind: "path", value: args.path.trim() });
    }
    if (typeof args.name === "string" && args.name.trim()) {
      provided.push({ kind: "name", value: args.name.trim() });
    }

    if (provided.length === 0) {
      return {
        ok: false,
        code: APPLICATION_ERROR_CODES.INVALID_INPUT,
        message: "Provide name, bundleId, path, or id",
      };
    }

    // Prefer most specific: id > bundleId > path > name
    const order: ApplicationLookup["kind"][] = ["id", "bundleId", "path", "name"];
    for (const kind of order) {
      const hit = provided.find((p) => p.kind === kind);
      if (hit) return this.resolve(hit);
    }

    return {
      ok: false,
      code: APPLICATION_ERROR_CODES.INVALID_INPUT,
      message: "Unable to resolve application",
    };
  }

  private resolveName(name: string): ResolveResult {
    if (!name || name.trim() === "") {
      return {
        ok: false,
        code: APPLICATION_ERROR_CODES.INVALID_INPUT,
        message: "Application name must be non-empty",
      };
    }
    if (INVALID_NAME_PATTERN.test(name)) {
      return {
        ok: false,
        code: APPLICATION_ERROR_CODES.INVALID_INPUT,
        message:
          "Application name contains invalid characters (command-like input rejected)",
      };
    }
    if (name.length > 128) {
      return {
        ok: false,
        code: APPLICATION_ERROR_CODES.INVALID_INPUT,
        message: "Application name too long",
      };
    }
    const app = this.registry.findByName(name);
    if (!app) {
      return {
        ok: false,
        code: APPLICATION_ERROR_CODES.NOT_FOUND,
        message: `Unknown application: "${name}"`,
      };
    }
    return { ok: true, app };
  }

  private resolveBundleId(bundleId: string): ResolveResult {
    if (!BUNDLE_ID_PATTERN.test(bundleId)) {
      return {
        ok: false,
        code: APPLICATION_ERROR_CODES.INVALID_INPUT,
        message: "Invalid bundleId format",
      };
    }
    const app = this.registry.findByBundleId(bundleId);
    if (!app) {
      return {
        ok: false,
        code: APPLICATION_ERROR_CODES.NOT_FOUND,
        message: `Unknown bundleId: "${bundleId}"`,
      };
    }
    return { ok: true, app };
  }

  private resolvePath(appPath: string): ResolveResult {
    if (INVALID_NAME_PATTERN.test(appPath) || appPath.includes("\0")) {
      return {
        ok: false,
        code: APPLICATION_ERROR_CODES.INVALID_INPUT,
        message: "Invalid application path",
      };
    }
    if (!appPath.endsWith(".app") && !appPath.includes(".app/")) {
      return {
        ok: false,
        code: APPLICATION_ERROR_CODES.INVALID_INPUT,
        message: "Application path must refer to a .app bundle",
      };
    }
    const app = this.registry.findByPath(appPath);
    if (!app) {
      return {
        ok: false,
        code: APPLICATION_ERROR_CODES.NOT_FOUND,
        message: `Path not in registry: "${appPath}"`,
      };
    }
    return { ok: true, app };
  }

  private resolveId(id: string): ResolveResult {
    if (INVALID_NAME_PATTERN.test(id)) {
      return {
        ok: false,
        code: APPLICATION_ERROR_CODES.INVALID_INPUT,
        message: "Invalid application id",
      };
    }
    const app = this.registry.get(id);
    if (!app) {
      return {
        ok: false,
        code: APPLICATION_ERROR_CODES.NOT_FOUND,
        message: `Unknown application id: "${id}"`,
      };
    }
    return { ok: true, app };
  }
}
