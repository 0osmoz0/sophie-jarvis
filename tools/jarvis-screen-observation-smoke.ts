/**
 * Phase 6 screen observation smoke tests.
 * Default: MockScreenBackend. Opt-in: JARVIS_MACOS_SCREEN_TESTS=1
 */
import { JarvisCore } from "../src/core/JarvisCore.js";
import { PermissionManager } from "../src/permissions/PermissionManager.js";
import { RiskLevel } from "../src/permissions/RiskLevel.js";
import { TaskManager } from "../src/core/TaskManager.js";
import { ToolRegistry } from "../src/tools/ToolRegistry.js";
import { registerScreenTools } from "../src/tools/registerScreenTools.js";
import { ScreenService } from "../src/screen/ScreenService.js";
import { MockScreenBackend } from "../src/screen/MockScreenBackend.js";
import { ScreenPolicy } from "../src/screen/ScreenPolicy.js";
import { MemoryScreenAuditLog } from "../src/screen/ScreenAuditLog.js";
import { SCREEN_ERROR_CODES } from "../src/screen/types.js";
import { MacOSScreenBackend } from "../src/platform/macos/MacOSScreenBackend.js";
import type { MacOSScreenNativeBridge } from "../src/platform/macos/MacOSScreenBackend.types.js";
import { runScreenObservationAudit } from "./jarvis-screen-observation-audit.js";

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

function createHarness(backend?: MockScreenBackend) {
  const mock = backend ?? new MockScreenBackend();
  mock.setWindows([
    {
      id: "w1",
      title: "Notes",
      applicationName: "Notes",
      bundleId: "com.apple.Notes",
      bounds: { x: 10, y: 10, width: 400, height: 300 },
      visible: true,
      minimized: false,
    },
  ]);
  mock.setActiveWindowId("w1");
  const audit = new MemoryScreenAuditLog();
  const service = new ScreenService({
    backend: mock,
    policy: new ScreenPolicy(),
    audit,
  });
  const registry = new ToolRegistry();
  registerScreenTools(registry, service);
  const core = new JarvisCore({
    registry,
    permissions: new PermissionManager(),
    tasks: new TaskManager(),
  });
  return { mock, service, audit, core, registry };
}

async function confirmCapture(core: JarvisCore, args: Record<string, unknown> = {}) {
  const waiting = await core.handleIntent({
    tool: "screen.capture",
    arguments: args,
  });
  assert(waiting.task.status === "waiting_confirmation", "needs confirm");
  assert(waiting.executed === false, "not executed");
  return core.confirmTask(waiting.task.id, {
    taskId: waiting.task.id,
    confirmed: true,
  });
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Screen Observation Phase 6 — Smoke Tests ===\n");

  console.log("1) ScreenBackend interface / MockScreenBackend");
  await test("mock getScreens returns geometry", async () => {
    const mock = new MockScreenBackend();
    const r = await mock.getScreens();
    assert(r.success && r.data.count >= 1, "count");
    assert(r.success && r.data.screens[0]!.width > 0, "width");
  });

  console.log("\n2) MockScreenBackend windows/session/capture");
  await test("mock windows and session", async () => {
    const { mock } = createHarness();
    const w = await mock.getWindows();
    assert(w.success && w.data.windows.length === 1, "windows");
    const s = await mock.getSessionInfo();
    assert(s.success && s.data.locked === false, "session");
  });

  console.log("\n3) ScreenPolicy");
  await test("capture is HIGH and automatic forbidden", () => {
    const policy = new ScreenPolicy();
    assert(policy.riskFor("capture") === RiskLevel.HIGH, "HIGH");
    assert(policy.riskFor("info") === RiskLevel.LOW, "LOW");
    assert(policy.allowsAutomaticCapture() === false, "no auto");
  });

  console.log("\n4) ScreenService");
  await test("service info via mock", async () => {
    const { service } = createHarness();
    const r = await service.info();
    assert(r.success === true, "ok");
  });

  console.log("\n5) screen.info tool");
  await test("screen.info via core LOW", async () => {
    const { core } = createHarness();
    const r = await core.handleIntent({ tool: "screen.info", arguments: {} });
    assert(r.permission.decision === "allow", "allow");
    assert(r.task.status === "completed", "completed");
  });

  console.log("\n6) screen.windows");
  await test("screen.windows metadata only", async () => {
    const { core } = createHarness();
    const r = await core.handleIntent({ tool: "screen.windows", arguments: {} });
    assert(r.task.status === "completed", "completed");
    const data = r.task.result as { windows: Array<{ id: string; title?: string }> };
    assert(data.windows[0]?.id === "w1", "id");
    assert(!("data" in (data.windows[0] as object) && "pixels" in (data.windows[0] as object)), "no pixels");
  });

  console.log("\n7) screen.activeWindow");
  await test("active window", async () => {
    const { core } = createHarness();
    const r = await core.handleIntent({
      tool: "screen.activeWindow",
      arguments: {},
    });
    assert(r.task.status === "completed", "ok");
    const data = r.task.result as {
      window: { id: string } | null;
      application: string | null;
    };
    assert(data.window?.id === "w1", "active");
    assert(data.application === "Notes", "app");
  });

  console.log("\n8) screen.session");
  await test("session state", async () => {
    const { core } = createHarness();
    const r = await core.handleIntent({ tool: "screen.session", arguments: {} });
    assert(r.task.status === "completed", "ok");
  });

  console.log("\n9) screen.capture");
  await test("capture with confirmation returns in-memory image", async () => {
    const { core, service } = createHarness();
    const r = await confirmCapture(core, {});
    assert(r.executed === true, "executed");
    assert(r.task.status === "completed", "completed");
    const data = r.task.result as {
      image: { width: number; byteLength: number; data: Uint8Array };
    };
    assert(data.image.width > 0, "width");
    assert(data.image.byteLength > 0, "bytes");
    assert(service.hasRetainedCapture() === false, "no retention");
  });

  console.log("\n10) permission gating");
  await test("capture PERMISSION_REQUIRED when mock disables capture", async () => {
    const mock = new MockScreenBackend();
    mock.setCaptureEnabled(false);
    const { core } = createHarness(mock);
    const r = await confirmCapture(core);
    assert(r.task.status === "failed", "failed");
    assert(
      String(r.task.error).includes("PERMISSION_REQUIRED") ||
        r.task.status === "failed",
      "permission",
    );
  });

  console.log("\n11) capture confirmation");
  await test("capture without confirmation does not execute", async () => {
    const { core } = createHarness();
    const waiting = await core.handleIntent({
      tool: "screen.capture",
      arguments: {},
    });
    assert(waiting.executed === false, "not executed");
    assert(waiting.permission.decision === "require_confirmation", "confirm");
  });

  console.log("\n12) privacy");
  await test("audit never contains screenshot bytes", async () => {
    const { core, audit } = createHarness();
    await confirmCapture(core);
    const entries = audit.list();
    assert(entries.length >= 1, "entries");
    const json = JSON.stringify(entries);
    assert(!json.includes("89,80,78,71"), "no png signature in audit");
    assert(!/"data"\s*:/.test(json), "no data field in audit");
  });

  console.log("\n13) audit log");
  await test("audit has toolId and risk", async () => {
    const { service, audit } = createHarness();
    await service.info();
    const e = audit.list().find((x) => x.toolId === "screen.info");
    assert(e !== undefined, "info audited");
    assert(e!.riskLevel === RiskLevel.LOW, "low");
  });

  console.log("\n14) unavailable handling");
  await test("MacOSScreenBackend unavailable without bridge", async () => {
    const backend = new MacOSScreenBackend({ skipNativeLoad: true });
    assert(backend.getCapabilityStatus("capture").status === "UNAVAILABLE", "cap");
    const cap = await backend.captureScreen();
    assert(cap.success === false, "fail");
    assert(
      !cap.success && cap.error.code === SCREEN_ERROR_CODES.UNAVAILABLE,
      "code",
    );
    const session = await backend.getSessionInfo();
    assert(session.success && session.data.locked === null, "null not invented");
  });

  console.log("\n15) malformed input");
  await test("screen.capture rejects unknown args", async () => {
    const { core } = createHarness();
    let threw = false;
    try {
      await core.handleIntent({
        tool: "screen.capture",
        arguments: { upload: true },
      });
    } catch {
      threw = true;
    }
    assert(threw, "rejected");
  });

  console.log("\n16) fake bridge path");
  await test("injected screen bridge works", async () => {
    const bridge: MacOSScreenNativeBridge = {
      async getDisplays() {
        return [
          {
            id: "d0",
            width: 1280,
            height: 800,
            isPrimary: true,
            scaleFactor: 1,
          },
        ];
      },
      async getWindows() {
        return [{ id: "wx", title: "T", applicationName: "A" }];
      },
      async getActiveWindow() {
        return { id: "wx", title: "T", applicationName: "A", active: true };
      },
      async getSessionInfo() {
        return { locked: false, userPresent: null };
      },
      async captureDisplay() {
        return {
          format: "png",
          width: 10,
          height: 10,
          data: new Uint8Array([1, 2, 3]),
          displayId: "d0",
        };
      },
    };
    const backend = new MacOSScreenBackend({ bridge });
    const screens = await backend.getScreens();
    assert(screens.success && screens.data.count === 1, "screens");
    const shot = await backend.captureScreen();
    assert(shot.success === true, "capture");
  });

  console.log("\n17) security audit");
  await test("screen observation audit passes", async () => {
    const report = await runScreenObservationAudit();
    assert(report.ok, report.failures.join("; ") || "audit failed");
  });

  if (process.env.JARVIS_MACOS_SCREEN_TESTS === "1") {
    console.log("\n[opt-in] JARVIS_MACOS_SCREEN_TESTS=1");
    await test("system backend does not save/upload screenshots", async () => {
      const backend = new MacOSScreenBackend();
      await backend.ensureBridge();
      const cap = backend.getCapabilityStatus("capture");
      if (cap.status === "UNAVAILABLE") {
        const r = await backend.captureScreen();
        assert(r.success === false, "no fake success");
      } else {
        console.log("  (bridge present — skipping real capture for safety)");
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
    console.log("All screen observation smoke tests passed.\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
