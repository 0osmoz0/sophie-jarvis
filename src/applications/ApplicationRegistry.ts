import type { RegisteredApplication } from "./types.js";

/**
 * ApplicationRegistry — controlled list of known applications.
 * No shell discovery (no find/mdfind/ls/ps). Populate explicitly.
 */
export class ApplicationRegistry {
  private readonly byId = new Map<string, RegisteredApplication>();

  register(app: RegisteredApplication): void {
    if (!app.id || !app.name) {
      throw new Error("RegisteredApplication requires id and name");
    }
    if (this.byId.has(app.id)) {
      throw new Error(`Application already registered: ${app.id}`);
    }
    this.byId.set(app.id, {
      ...app,
      aliases: app.aliases?.map((a) => a.toLowerCase()) ?? [],
    });
  }

  unregister(id: string): boolean {
    return this.byId.delete(id);
  }

  get(id: string): RegisteredApplication | undefined {
    return this.byId.get(id);
  }

  list(): RegisteredApplication[] {
    return [...this.byId.values()].map((a) => ({ ...a }));
  }

  clear(): void {
    this.byId.clear();
  }

  findByName(name: string): RegisteredApplication | undefined {
    const needle = name.trim().toLowerCase();
    for (const app of this.byId.values()) {
      if (app.name.toLowerCase() === needle) return { ...app };
      if (app.aliases?.some((a) => a === needle)) return { ...app };
    }
    return undefined;
  }

  findByBundleId(bundleId: string): RegisteredApplication | undefined {
    const needle = bundleId.trim().toLowerCase();
    for (const app of this.byId.values()) {
      if (app.bundleId?.toLowerCase() === needle) return { ...app };
    }
    return undefined;
  }

  findByPath(appPath: string): RegisteredApplication | undefined {
    const needle = appPath.trim();
    for (const app of this.byId.values()) {
      if (app.path === needle) return { ...app };
    }
    return undefined;
  }
}
