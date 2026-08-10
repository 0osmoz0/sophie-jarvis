import { ApplicationRegistry } from "../src/applications/ApplicationRegistry.js";
import { ApplicationResolver } from "../src/applications/ApplicationResolver.js";
import { ApplicationPolicy } from "../src/applications/ApplicationPolicy.js";
import { ApplicationService } from "../src/applications/ApplicationService.js";
import { APPLICATION_ERROR_CODES } from "../src/applications/types.js";
import { MockApplicationBackend } from "../src/platform/MockApplicationBackend.js";
import {
  MacOSApplicationBackend,
  MacOSApplicationDiscovery,
} from "../src/platform/macos/index.js";
import type { MacOSNativeBridge } from "../src/platform/macos/MacOSApplicationBackend.types.js";
import { runMacOSBackendAudit } from "./jarvis-macos-backend-audit.js";

interface TestResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: TestResult[] = [];

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

function createFakeBridge(): MacOSNativeBridge {
  const running = new Set<string>();
  return {
    async listRunningApplications() {
      return [...running].map((bundleId) => ({
        name: bundleId,
        bundleId,
        path: null,
        running: true,
      }));
    },
    async getFrontmostApplication() {
      const first = [...running][0];
      if (!first) return null;
      return { name: first, bundleId: first, path: null, running: true };
    },
    async openApplication(identity) {
      const id = identity.bundleId ?? identity.path;
      if (!id) return { ok: false, code: "INVALID_IDENTITY", message: "missing" };
      running.add(id);
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
      return { ok: true };
    },
    async isApplicationRunning(identity) {
      const id = identity.bundleId ?? identity.path;
      return !!id && running.has(id);
    },
  };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS macOS Application Backend Phase 5 — Smoke Tests ===\n");
  console.log(
    "Default: mock + unavailable macOS backend (no real app mutations).\n" +
      "Opt-in: JARVIS_MACOS_SYSTEM_TESTS=1 (still no personal-app close; mutations only if bridge present).\n",
  );

  console.log("1) backend availability");
  await test("MacOS backend reports UNAVAILABLE without native bridge", async () => {
    const backend = new MacOSApplicationBackend({ skipNativeLoad: true });
    const openCap = backend.getCapabilityStatus("openApplication");
    assert(openCap.status === "UNAVAILABLE", "open unavailable");
    const closeCap = backend.getCapabilityStatus("closeApplication");
    assert(closeCap.status === "UNAVAILABLE", "close unavailable");
    const activeCap = backend.getCapabilityStatus("getActiveApplication");
    assert(activeCap.status === "UNAVAILABLE", "active unavailable");
    const open = await backend.openApplication({
      bundleId: "com.jarvis.testapp",
      name: "JarvisTestApp",
    });
    assert(open.success === false, "open fails");
    assert(
      !open.success && open.error.code === APPLICATION_ERROR_CODES.UNAVAILABLE,
      "UNAVAILABLE code",
    );
  });

  await test("injected fake bridge marks capabilities AVAILABLE", () => {
    const backend = new MacOSApplicationBackend({ bridge: createFakeBridge() });
    assert(backend.getNativeStatus() === "bridge_loaded", "loaded");
    assert(
      backend.getCapabilityStatus("openApplication").status === "AVAILABLE",
      "open available",
    );
  });

  console.log("\n2) application discovery");
  await test("discovery does not invent system-wide apps without bridge", async () => {
    const discovery = new MacOSApplicationDiscovery(null);
    const listed = await discovery.listFromNative();
    assert(listed.success === false, "unavailable");
    const exists = await discovery.pathExists("/Applications/DoesNotExistXYZ.app");
    assert(exists === false, "missing path");
  });

  console.log("\n3) resolver");
  await test("resolver still blocks command injection", () => {
    const registry = new ApplicationRegistry();
    registry.register({
      id: "t",
      name: "JarvisTestApp",
      bundleId: "com.jarvis.testapp",
    });
    const resolver = new ApplicationResolver(registry);
    const bad = resolver.resolve({
      kind: "name",
      value: "JarvisTestApp && rm -rf /",
    });
    assert(bad.ok === false, "rejected");
  });

  console.log("\n4) running state");
  await test("isApplicationRunning via fake bridge", async () => {
    const bridge = createFakeBridge();
    const backend = new MacOSApplicationBackend({ bridge });
    const before = await backend.isApplicationRunning({
      bundleId: "com.jarvis.testapp",
    });
    assert(before.success && before.data.running === false, "not running");
    await backend.openApplication({ bundleId: "com.jarvis.testapp", name: "T" });
    const after = await backend.isApplicationRunning({
      bundleId: "com.jarvis.testapp",
    });
    assert(after.success && after.data.running === true, "running");
  });

  console.log("\n5) active application");
  await test("getActiveApplication via fake bridge", async () => {
    const bridge = createFakeBridge();
    const backend = new MacOSApplicationBackend({ bridge });
    await backend.openApplication({ bundleId: "com.jarvis.testapp" });
    const active = await backend.getActiveApplication();
    assert(active.success === true, "ok");
    assert(active.success && active.data?.bundleId === "com.jarvis.testapp", "active");
  });

  console.log("\n6) open application");
  await test("service open through MacOS backend + fake bridge", async () => {
    const registry = new ApplicationRegistry();
    registry.register({
      id: "jarvis.test",
      name: "JarvisTestApp",
      bundleId: "com.jarvis.testapp",
      path: "/Applications/JarvisTestApp.app",
    });
    const backend = new MacOSApplicationBackend({ bridge: createFakeBridge() });
    const service = new ApplicationService({ registry, backend });
    const result = await service.open({
      name: "JarvisTestApp",
      confirmed: true,
    });
    assert(result.success === true, "opened");
    assert(result.success && result.data.running === true, "running");
  });

  console.log("\n7) close application");
  await test("service close through MacOS backend + fake bridge", async () => {
    const registry = new ApplicationRegistry();
    registry.register({
      id: "jarvis.test",
      name: "JarvisTestApp",
      bundleId: "com.jarvis.testapp",
    });
    const backend = new MacOSApplicationBackend({ bridge: createFakeBridge() });
    const service = new ApplicationService({ registry, backend });
    await service.open({ name: "JarvisTestApp", confirmed: true });
    const closed = await service.close({ name: "JarvisTestApp", confirmed: true });
    assert(closed.success === true, "closed");
    assert(closed.success && closed.data.running === false, "stopped");
  });

  console.log("\n8) permission states");
  await test("capability reports are structured", () => {
    const backend = new MacOSApplicationBackend({ skipNativeLoad: true });
    const report = backend.getCapabilityStatus("getActiveApplication");
    assert(report.capability === "getActiveApplication", "name");
    assert(
      report.status === "AVAILABLE" ||
        report.status === "UNAVAILABLE" ||
        report.status === "PERMISSION_REQUIRED",
      "status enum",
    );
  });

  console.log("\n9) denylist");
  await test("Finder close still denied by policy before backend", async () => {
    const registry = new ApplicationRegistry();
    registry.register({
      id: "system.finder",
      name: "Finder",
      bundleId: "com.apple.finder",
      path: "/System/Library/CoreServices/Finder.app",
    });
    const backend = new MacOSApplicationBackend({ bridge: createFakeBridge() });
    const service = new ApplicationService({ registry, backend });
    const result = await service.close({ name: "Finder", confirmed: true });
    assert(result.success === false, "denied");
    assert(
      !result.success && result.error.code === APPLICATION_ERROR_CODES.DENYLIST,
      "DENYLIST",
    );
  });

  console.log("\n10) invalid identity");
  await test("invalid identity rejected", async () => {
    const backend = new MacOSApplicationBackend({ bridge: createFakeBridge() });
    const result = await backend.openApplication({});
    assert(result.success === false, "fail");
    assert(
      !result.success &&
        result.error.code === APPLICATION_ERROR_CODES.INVALID_IDENTITY,
      "INVALID_IDENTITY",
    );
  });

  console.log("\n11–13) no shell / scripting / force-kill (audit)");
  await test("macos backend security audit passes", async () => {
    const report = await runMacOSBackendAudit();
    assert(report.ok, report.failures.join("; ") || "audit failed");
  });

  console.log("\n14) mock backend still works");
  await test("MockApplicationBackend open/close", async () => {
    const mock = new MockApplicationBackend();
    mock.register({
      id: "m1",
      name: "MockApp",
      bundleId: "com.mock.app",
      path: null,
      running: false,
    });
    const opened = await mock.openApplication({ id: "m1", name: "MockApp" });
    assert(opened.success && opened.data.running === true, "open");
    const closed = await mock.closeApplication({ id: "m1" });
    assert(closed.success && closed.data.running === false, "close");
  });

  console.log("\n15) ApplicationPolicy still present");
  await test("policy denylist names include Dock", () => {
    const policy = new ApplicationPolicy();
    assert(policy.getDenylistNames().includes("Dock"), "Dock");
  });

  if (process.env.JARVIS_MACOS_SYSTEM_TESTS === "1") {
    console.log("\n[opt-in] JARVIS_MACOS_SYSTEM_TESTS=1");
    await test("system: real MacOS backend open remains unavailable without bridge", async () => {
      const backend = new MacOSApplicationBackend();
      await backend.ensureBridge();
      const status = backend.getNativeStatus();
      assert(
        status === "bridge_missing" || status === "bridge_loaded" || status === "not_darwin",
        "status",
      );
      if (status === "bridge_missing" || status === "not_darwin") {
        const open = await backend.openApplication({
          bundleId: "com.apple.TextEdit",
        });
        assert(open.success === false, "no mutation without bridge");
        assert(
          !open.success && open.error.code === APPLICATION_ERROR_CODES.UNAVAILABLE,
          "UNAVAILABLE",
        );
      } else {
        console.log(
          "  (bridge present — skipping mutation against real apps for safety)",
        );
      }
    });
  }

  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed.length > 0) {
    console.error("Failures:");
    for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log("All macOS backend smoke tests passed.\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
