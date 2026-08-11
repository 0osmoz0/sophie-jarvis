/**
 * Phase 24 — Environment smoke tests (Mock backends — no real TCC).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApplicationRegistry,
  MockApplicationService,
  MemoryApplicationAuditLog,
} from "../src/applications/index.js";
import { MockApplicationBackend } from "../src/platform/MockApplicationBackend.js";
import { ScreenService } from "../src/screen/ScreenService.js";
import { MockScreenBackend } from "../src/screen/MockScreenBackend.js";
import { UserActivityService } from "../src/presence/UserActivityService.js";
import { MockUserActivityBackend } from "../src/presence/MockUserActivityBackend.js";
import {
  ContextService,
  ContextFormatter,
  computeFreshness,
} from "../src/context/index.js";
import { EntityTracker } from "../src/conversation/EntityTracker.js";
import { ReferenceResolver } from "../src/conversation/ReferenceResolver.js";
import { MockCursorReader } from "../src/platform/macos/MockCursorReader.js";

interface TestResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function assert(c: boolean, m: string): void {
  if (!c) throw new Error(m);
}

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, detail });
    console.error(`  ✗ ${name}: ${detail}`);
  }
}

function makeServices() {
  const backend = new MockApplicationBackend();
  backend.register({
    id: "safari",
    name: "Safari",
    bundleId: "com.apple.Safari",
    running: true,
    active: true,
  });
  backend.register({
    id: "chrome",
    name: "Chrome",
    bundleId: "com.google.Chrome",
    running: true,
    active: false,
  });
  backend.setRunning("safari", true);
  backend.setRunning("chrome", true);
  backend.setActive("safari");

  const registry = new ApplicationRegistry();
  registry.register({
    id: "safari",
    name: "Safari",
    bundleId: "com.apple.Safari",
  });
  registry.register({
    id: "chrome",
    name: "Chrome",
    bundleId: "com.google.Chrome",
  });

  const apps = new MockApplicationService({
    registry,
    backend,
    audit: new MemoryApplicationAuditLog(),
  });
  apps.mockSetRunning("safari", true);
  apps.mockSetRunning("chrome", true);
  backend.setActive("safari");

  const screenBackend = new MockScreenBackend();
  screenBackend.setScreens([
    {
      id: "display-0",
      width: 1512,
      height: 982,
      scaleFactor: 2,
      isPrimary: true,
      bounds: { x: 0, y: 0, width: 1512, height: 982 },
    },
  ]);
  screenBackend.setWindows([
    {
      id: "w1",
      title: "Home",
      applicationName: "Safari",
      bounds: { x: 0, y: 25, width: 800, height: 600 },
    },
  ]);
  screenBackend.setActiveWindowId("w1");
  screenBackend.setSession({ locked: false, userPresent: null });

  const screen = new ScreenService({ backend: screenBackend });
  const activityBackend = new MockUserActivityBackend();
  activityBackend.setIdleSeconds(5);
  const activity = new UserActivityService({ backend: activityBackend });
  const context = new ContextService({ applications: apps, screen, activity });
  return { context, screenBackend, backend, apps };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Environment Phase 24 — Smoke ===\n");

  await test("1. screen available", async () => {
    const { context } = makeServices();
    const { environment } = await context.getEnvironmentSnapshot();
    assert(environment.screen.available === "AVAILABLE", "screen avail");
    assert(environment.screen.displayCount >= 1, "displays");
    assert(environment.screen.scaleFactor === 2, "scale");
  });

  await test("2. application active", async () => {
    const { context } = makeServices();
    const { environment } = await context.getEnvironmentSnapshot();
    assert(environment.application.available === "AVAILABLE", "apps");
    assert(environment.application.active?.name === "Safari", "active Safari");
  });

  await test("3. running applications", async () => {
    const { context } = makeServices();
    const { environment } = await context.getEnvironmentSnapshot();
    assert(
      (environment.application.runningCount ?? 0) >= 2,
      `runningCount=${environment.application.runningCount}`,
    );
  });

  await test("4. window metadata", async () => {
    const { context } = makeServices();
    const { environment } = await context.getEnvironmentSnapshot();
    assert(environment.window.available === "AVAILABLE", "window");
    assert(environment.window.titleAvailable === true, "title");
    assert(environment.window.boundsAvailable === true, "bounds");
  });

  await test("5. idle state", async () => {
    const { context } = makeServices();
    const { environment } = await context.getEnvironmentSnapshot();
    assert(environment.userActivity.available === "AVAILABLE", "activity");
    assert(environment.userActivity.activityLevel === "ACTIVE", "ACTIVE");
    assert(environment.userActivity.idleSeconds === 5, "idle");
  });

  await test("6. session unknown handling", async () => {
    const { context, screenBackend } = makeServices();
    screenBackend.setSession({ locked: null, userPresent: null });
    const { environment } = await context.getEnvironmentSnapshot();
    assert(environment.session.available === "UNKNOWN", "UNKNOWN");
    assert(environment.session.locked === null, "locked null");
    assert(environment.session.userPresent === null, "userPresent null");
  });

  await test("7. permission state", async () => {
    const { context } = makeServices();
    const { environment } = await context.getEnvironmentSnapshot();
    assert(
      ["AVAILABLE", "REQUIRED", "DENIED", "UNKNOWN"].includes(
        environment.permissions.accessibility,
      ),
      "accessibility reported",
    );
    assert(environment.permissions.microphone === "UNKNOWN", "mic unknown");
  });

  await test("8. unavailable backend", async () => {
    const unavailableCursor = new MockCursorReader();
    unavailableCursor.setUnavailable(true);
    const context = new ContextService({
      cursorReader: unavailableCursor,
    });
    const { environment } = await context.getEnvironmentSnapshot();
    assert(environment.screen.available === "UNAVAILABLE", "no screen");
    assert(environment.application.available === "UNAVAILABLE", "no apps");
    assert(environment.cursor.available === "UNAVAILABLE", "no cursor");
    assert(environment.audio.available === "UNAVAILABLE", "no audio");
    assert(environment.focusedWindow.available === "UNAVAILABLE", "no focus");
  });

  await test("9. multi-display simulation", async () => {
    const { context, screenBackend } = makeServices();
    screenBackend.setScreens([
      {
        id: "display-0",
        width: 1512,
        height: 982,
        scaleFactor: 2,
        isPrimary: true,
        bounds: { x: 0, y: 0, width: 1512, height: 982 },
      },
      {
        id: "display-1",
        width: 2560,
        height: 1440,
        scaleFactor: 1,
        isPrimary: false,
        bounds: { x: 1512, y: 0, width: 2560, height: 1440 },
      },
    ]);
    const { environment } = await context.getEnvironmentSnapshot();
    assert(environment.screen.displayCount === 2, "2 displays");
    assert(environment.screen.globalBounds != null, "global bounds");
  });

  await test("10. stale snapshot", async () => {
    const now = Date.now();
    const f = computeFreshness(now - 60_000, now);
    assert(f.status === "STALE", "stale");
    assert(f.ageMs != null && f.ageMs >= 15_000, "age");
  });

  await test("11. context query", async () => {
    const { context } = makeServices();
    const r = await context.getSnapshot("screen.status");
    assert(r.snapshot.screen.status === "available", "screen query");
    assert(
      (r.snapshot.screen.displays?.[0]?.scaleFactor ?? null) === 2,
      "scale in context",
    );
    assert(r.snapshot.screen.session != null, "session in context");
    const text = new ContextFormatter().format(r.snapshot, "screen.status");
    assert(/écran/i.test(text), "formatted");
  });

  await test("12. conversation reference using active application", async () => {
    const { context } = makeServices();
    const { environment } = await context.getEnvironmentSnapshot();
    const resolver = new ReferenceResolver({ allowEnvironment: true });
    const entities = new EntityTracker();
    const single = resolver.resolve("ferme-le", entities, {
      activeApplication: environment.application.active?.name ?? null,
      openApplications: [environment.application.active?.name ?? "Safari"],
    });
    assert(single.resolved === true, "single app resolves");

    const amb = resolver.resolve("ferme-le", entities, {
      activeApplication: null,
      openApplications: ["Chrome", "Safari"],
    });
    assert(amb.status === "ambiguous", "multi → clarify");
  });

  await test("timing nulls for skipped cursor/audio sources", async () => {
    const { context } = makeServices();
    const { timing } = await context.getEnvironmentSnapshot();
    assert(timing.totalContextMs >= 0, "total");
    assert(timing.screenMs != null, "screen timed");
    assert(timing.cursorMs === 0, "cursor skipped=0");
    assert(timing.audioMs === 0, "audio skipped=0");
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
  if (failed.length) process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
