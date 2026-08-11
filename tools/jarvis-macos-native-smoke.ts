/**
 * Phase 13 macOS native capability smoke tests.
 * Default: injected mocks only (no user data mutation).
 * Opt-in live: JARVIS_MACOS_NATIVE_TESTS=1
 */
import { ApplicationRegistry } from "../src/applications/ApplicationRegistry.js";
import { ApplicationService } from "../src/applications/ApplicationService.js";
import { MemoryApplicationAuditLog } from "../src/applications/ApplicationAuditLog.js";
import { APPLICATION_ERROR_CODES } from "../src/applications/types.js";
import { MacOSApplicationBackend } from "../src/platform/macos/MacOSApplicationBackend.js";
import type { MacOSNativeBridge } from "../src/platform/macos/MacOSApplicationBackend.types.js";
import { MacOSScreenBackend } from "../src/platform/macos/MacOSScreenBackend.js";
import type { MacOSScreenNativeBridge } from "../src/platform/macos/MacOSScreenBackend.types.js";
import { MacOSUserActivityBackend } from "../src/platform/macos/MacOSUserActivityBackend.js";
import type { MacOSUserActivityNativeBridge } from "../src/platform/macos/MacOSUserActivityBackend.types.js";
import { ScreenService } from "../src/screen/ScreenService.js";
import { UserActivityService } from "../src/presence/UserActivityService.js";
import { ObservationService } from "../src/observation/ObservationService.js";
import { ContextService } from "../src/context/ContextService.js";
import { loadJarvisMacosAddon, resetAddonCache } from "../src/platform/macos/native/loadAddon.js";
import { runMacOSNativeAudit } from "./jarvis-macos-native-audit.js";

interface TestResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: TestResult[] = [];
const timings: Record<string, number> = {};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      results.push({ name, ok: true });
      console.log(`  ✓ ${name}`);
    })
    .catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      results.push({ name, ok: false, detail });
      console.error(`  ✗ ${name}: ${detail}`);
    });
}

function createFakeAppBridge(): MacOSNativeBridge {
  const running = new Map<string, { name: string; path: string | null }>();
  let front: string | null = null;
  return {
    async listRunningApplications() {
      return [...running.entries()].map(([bundleId, v]) => ({
        name: v.name,
        bundleId,
        path: v.path,
        running: true,
      }));
    },
    async getFrontmostApplication() {
      if (!front || !running.has(front)) return null;
      const v = running.get(front)!;
      return { name: v.name, bundleId: front, path: v.path, running: true };
    },
    async openApplication(identity) {
      const id = identity.bundleId ?? identity.path;
      if (!id) return { ok: false, code: "INVALID_IDENTITY", message: "missing" };
      running.set(id, { name: id, path: identity.path ?? null });
      front = id;
      return { ok: true };
    },
    async terminateApplicationGracefully(identity) {
      const id = identity.bundleId ?? identity.path;
      if (!id || !running.has(id)) {
        return {
          ok: false,
          code: APPLICATION_ERROR_CODES.APPLICATION_NOT_RUNNING,
          message: "not running",
        };
      }
      running.delete(id);
      if (front === id) front = null;
      return { ok: true };
    },
    async isApplicationRunning(identity) {
      const id = identity.bundleId ?? identity.path;
      return !!id && running.has(id);
    },
  };
}

function createFakeScreenBridge(options?: {
  permissionCapture?: boolean;
}): MacOSScreenNativeBridge {
  return {
    async getDisplays() {
      return [
        {
          id: "display-0",
          width: 1440,
          height: 900,
          scaleFactor: 2,
          isPrimary: true,
          bounds: { x: 0, y: 0, width: 1440, height: 900 },
        },
      ];
    },
    async getWindows() {
      return [
        {
          id: "1",
          title: "Editor",
          applicationName: "TestApp",
          bundleId: "com.test.app",
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          visible: true,
          minimized: false,
          active: true,
        },
      ];
    },
    async getActiveWindow() {
      return {
        id: "1",
        title: "Editor",
        applicationName: "TestApp",
        bundleId: "com.test.app",
        visible: true,
        active: true,
      };
    },
    async getSessionInfo() {
      return { locked: false, userPresent: null };
    },
    async captureDisplay() {
      if (options?.permissionCapture) {
        throw new Error("PERMISSION_REQUIRED: Screen Recording required");
      }
      return {
        format: "png" as const,
        width: 10,
        height: 10,
        data: new Uint8Array([1, 2, 3]),
        displayId: "display-0",
      };
    },
  };
}

function createFakeActivityBridge(
  idleSeconds: number | (() => number),
): MacOSUserActivityNativeBridge {
  return {
    async getIdleTimeSeconds() {
      return typeof idleSeconds === "function" ? idleSeconds() : idleSeconds;
    },
  };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS macOS Native Phase 13 — Smoke Tests ===\n");
  console.log("Default path: injected mocks (no personal app mutations).\n");

  await test("1. application active", async () => {
    const bridge = createFakeAppBridge();
    await bridge.openApplication({ bundleId: "com.test.editor" });
    const backend = new MacOSApplicationBackend({ bridge });
    const t0 = Date.now();
    const active = await backend.getActiveApplication();
    timings.applicationActiveMs = Date.now() - t0;
    assert(active.success && active.data?.bundleId === "com.test.editor", "active");
  });

  await test("2. application list", async () => {
    const bridge = createFakeAppBridge();
    await bridge.openApplication({ bundleId: "com.test.a" });
    await bridge.openApplication({ bundleId: "com.test.b" });
    const backend = new MacOSApplicationBackend({ bridge });
    const t0 = Date.now();
    const list = await backend.listApplications();
    timings.applicationListMs = Date.now() - t0;
    assert(list.success && list.data.applications.length === 2, "list");
  });

  await test("3. application open", async () => {
    const bridge = createFakeAppBridge();
    const backend = new MacOSApplicationBackend({ bridge });
    const t0 = Date.now();
    const r = await backend.openApplication({
      bundleId: "com.test.calc",
      name: "Calc",
    });
    timings.applicationOpenMs = Date.now() - t0;
    assert(r.success, "open");
  });

  await test("4. application close", async () => {
    const bridge = createFakeAppBridge();
    await bridge.openApplication({ bundleId: "com.test.calc" });
    const backend = new MacOSApplicationBackend({ bridge });
    const t0 = Date.now();
    const r = await backend.closeApplication({ bundleId: "com.test.calc" });
    timings.applicationCloseMs = Date.now() - t0;
    assert(r.success, "close");
  });

  await test("5. graceful close", async () => {
    const bridge = createFakeAppBridge();
    await bridge.openApplication({ bundleId: "com.test.x" });
    const r = await bridge.terminateApplicationGracefully({
      bundleId: "com.test.x",
    });
    assert(r.ok, "graceful");
  });

  await test("6. deny critical application", async () => {
    const registry = new ApplicationRegistry();
    registry.register({
      id: "finder",
      name: "Finder",
      bundleId: "com.apple.finder",
    });
    const service = new ApplicationService({
      registry,
      audit: new MemoryApplicationAuditLog(),
      backend: new MacOSApplicationBackend({ bridge: createFakeAppBridge() }),
    });
    const r = await service.close({
      name: "Finder",
      confirmed: true,
      taskId: "t1",
    });
    assert(!r.success, "denied");
    if (r.success) throw new Error("unreachable");
    assert(
      r.error.code === APPLICATION_ERROR_CODES.DENYLIST ||
        r.error.code === APPLICATION_ERROR_CODES.DENIED,
      `code=${r.error.code}`,
    );
  });

  await test("7. user activity", async () => {
    const backend = new MacOSUserActivityBackend({
      bridge: createFakeActivityBridge(5),
    });
    const service = new UserActivityService({ backend, idleThresholdSeconds: 30 });
    const t0 = Date.now();
    const r = await service.getActivity();
    timings.activityMs = Date.now() - t0;
    assert(r.success, "ok");
    if (!r.success) throw new Error("unreachable");
    assert(r.data.status === "ACTIVE", "active");
    assert(r.data.idleSeconds === 5, "idle");
  });

  await test("8. screen info", async () => {
    const backend = new MacOSScreenBackend({
      bridge: createFakeScreenBridge(),
    });
    const service = new ScreenService({ backend });
    const t0 = Date.now();
    const r = await service.info();
    timings.screenInfoMs = Date.now() - t0;
    assert(r.success && r.data.screens.length === 1, "screens");
  });

  await test("9. window metadata", async () => {
    const backend = new MacOSScreenBackend({
      bridge: createFakeScreenBridge(),
    });
    const t0 = Date.now();
    const r = await backend.getWindows();
    timings.windowDiscoveryMs = Date.now() - t0;
    assert(r.success, "ok");
    if (!r.success) throw new Error("unreachable");
    assert(r.data.windows[0]?.applicationName === "TestApp", "window");
    assert(!("password" in (r.data.windows[0] as object)), "no password");
  });

  await test("10. active window", async () => {
    const backend = new MacOSScreenBackend({
      bridge: createFakeScreenBridge(),
    });
    const r = await backend.getActiveWindow();
    assert(r.success, "ok");
    if (!r.success) throw new Error("unreachable");
    assert(r.data.window?.active === true, "active window");
  });

  await test("11. session", async () => {
    const backend = new MacOSScreenBackend({
      bridge: createFakeScreenBridge(),
    });
    const r = await backend.getSessionInfo();
    assert(r.success, "session");
    if (!r.success) throw new Error("unreachable");
    assert(
      r.data.userPresent === null || typeof r.data.userPresent === "boolean",
      "presence",
    );
  });

  await test("12. capture permission", async () => {
    const backend = new MacOSScreenBackend({
      bridge: createFakeScreenBridge({ permissionCapture: true }),
    });
    const service = new ScreenService({ backend });
    const r = await service.capture({ confirmed: true, taskId: "cap1" });
    assert(!r.success, "must fail");
    if (r.success) throw new Error("unreachable");
    assert(
      r.error.code === "PERMISSION_REQUIRED" ||
        /permission/i.test(r.error.message),
      "permission",
    );
  });

  await test("13. unavailable capability", async () => {
    const backend = new MacOSApplicationBackend({ bridge: null });
    const r = await backend.getActiveApplication();
    assert(!r.success && r.error.code === APPLICATION_ERROR_CODES.UNAVAILABLE, "unavail");
  });

  await test("14. permission required", async () => {
    const bridge: MacOSNativeBridge = {
      ...createFakeAppBridge(),
      async getFrontmostApplication() {
        throw new Error("Accessibility permission required");
      },
    };
    const backend = new MacOSApplicationBackend({ bridge });
    const r = await backend.getActiveApplication();
    assert(
      !r.success && r.error.code === APPLICATION_ERROR_CODES.PERMISSION_REQUIRED,
      "perm",
    );
  });

  await test("15. malformed native response", async () => {
    const backend = new MacOSUserActivityBackend({
      bridge: {
        async getIdleTimeSeconds() {
          return Number.NaN;
        },
      },
    });
    const idle = await backend.getIdleDuration();
    assert(idle.success && idle.data.idleSeconds === null, "null idle");
  });

  await test("16. no invented values", async () => {
    const context = new ContextService({
      observation: new ObservationService(),
      applications: undefined,
      screen: undefined,
      activity: undefined,
    });
    const snap = await context.getSnapshot("system.context");
    assert(
      snap.snapshot.applications.status === "unavailable" ||
        snap.snapshot.applications.running == null ||
        snap.snapshot.applications.running.length === 0 ||
        snap.snapshot.applications.status !== "available",
      "no fake apps",
    );
  });

  await test("17. audit privacy", async () => {
    const audit = new MemoryApplicationAuditLog();
    const registry = new ApplicationRegistry();
    registry.register({
      id: "demo",
      name: "Demo",
      bundleId: "com.test.demo",
    });
    const service = new ApplicationService({
      registry,
      audit,
      backend: new MacOSApplicationBackend({ bridge: createFakeAppBridge() }),
    });
    await service.list();
    const json = JSON.stringify(audit.list());
    assert(!/password|screenshot|clipboard/i.test(json), "privacy");
  });

  await test("18. security invariants", async () => {
    const report = await runMacOSNativeAudit();
    assert(report.ok, report.failures.join("; "));
  });

  await test("19. context uses backends when wired", async () => {
    const appBridge = createFakeAppBridge();
    await appBridge.openApplication({ bundleId: "com.test.ctx" });
    const apps = new ApplicationService({
      registry: new ApplicationRegistry(),
      backend: new MacOSApplicationBackend({ bridge: appBridge }),
      audit: new MemoryApplicationAuditLog(),
    });
    apps.registry.register({
      id: "ctx",
      name: "CtxApp",
      bundleId: "com.test.ctx",
    });
    await appBridge.openApplication({ bundleId: "com.test.ctx" });
    const context = new ContextService({
      observation: new ObservationService(),
      applications: apps,
      screen: new ScreenService({
        backend: new MacOSScreenBackend({ bridge: createFakeScreenBridge() }),
      }),
      activity: new UserActivityService({
        backend: new MacOSUserActivityBackend({
          bridge: createFakeActivityBridge(2),
        }),
      }),
    });
    const snap = await context.getSnapshot("system.context");
    assert(snap.snapshot.system.status === "available", "system");
    assert(snap.snapshot.screen.status === "available", "screen");
    assert(snap.snapshot.activity.status === "available", "activity");
  });

  // Opt-in real macOS tests
  if (process.env.JARVIS_MACOS_NATIVE_TESTS === "1") {
    console.log("\nOpt-in JARVIS_MACOS_NATIVE_TESTS=1\n");
    await test("opt-in: addon loads", () => {
      resetAddonCache();
      const addon = loadJarvisMacosAddon();
      assert(!!addon, "addon must be built (npm run build:native)");
    });

    await test("opt-in: frontmost + idle + displays", () => {
      resetAddonCache();
      const addon = loadJarvisMacosAddon();
      assert(!!addon, "addon");
      const idle = addon!.getIdleTimeSeconds();
      assert(Number.isFinite(idle) && idle >= 0, "idle");
      const displays = addon!.getDisplays();
      assert(displays.length >= 1, "displays");
      const front = addon!.getFrontmostApplication();
      assert(front === null || typeof front.name === "string", "front");
      // Never invent physical absence
      const session = addon!.getSessionInfo();
      assert(
        session.userPresent === null || typeof session.userPresent === "boolean",
        "userPresent honest",
      );
    });

    await test("opt-in: no auto-mutate critical apps", async () => {
      const backend = new MacOSApplicationBackend({});
      await backend.ensureBridge();
      const service = new ApplicationService({
        registry: new ApplicationRegistry(),
        backend,
        audit: new MemoryApplicationAuditLog(),
      });
      const r = await service.close({
        name: "Finder",
        confirmed: true,
        taskId: "opt-finder",
      });
      assert(!r.success, "finder denied");
    });
  } else {
    console.log(
      "\n(skip) JARVIS_MACOS_NATIVE_TESTS not set — live native tests skipped\n",
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\nTimings (mock path):", JSON.stringify(timings));
  console.log(
    `\n=== Results: ${results.length - failed.length}/${results.length} passed ===\n`,
  );
  if (failed.length > 0) {
    for (const f of failed) console.error(`FAIL: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
