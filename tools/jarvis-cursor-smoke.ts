/**
 * Phase 25 — Cursor & environment interaction smoke (Mock — no TCC bypass).
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
import { MockCursorReader } from "../src/platform/macos/MockCursorReader.js";
import { MockFocusReader } from "../src/platform/macos/MockFocusReader.js";
import {
  ContextService,
  computeCursorMotion,
  CursorProximityPolicy,
  CursorMotionTracker,
} from "../src/context/index.js";
import { ReferenceResolver } from "../src/conversation/ReferenceResolver.js";
import { EntityTracker } from "../src/conversation/EntityTracker.js";

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function assert(c: boolean, m: string): void {
  if (!c) throw new Error(m);
}

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    console.error(`  ✗ ${name}: ${results.at(-1)?.detail}`);
  }
}

function makeContext(cursor: MockCursorReader, focus: MockFocusReader) {
  const backend = new MockApplicationBackend();
  backend.register({
    id: "safari",
    name: "Safari",
    bundleId: "com.apple.Safari",
    running: true,
    active: true,
  });
  backend.setRunning("safari", true);
  backend.setActive("safari");
  const registry = new ApplicationRegistry();
  registry.register({ id: "safari", name: "Safari", bundleId: "com.apple.Safari" });
  const apps = new MockApplicationService({ registry, backend, audit: new MemoryApplicationAuditLog() });
  apps.mockSetRunning("safari", true);
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
  return new ContextService({
    applications: apps,
    screen: new ScreenService({ backend: screenBackend }),
    activity: new UserActivityService({
      backend: new MockUserActivityBackend(),
    }),
    cursorReader: cursor,
    focusReader: focus,
    cursorMotion: new CursorMotionTracker(),
  });
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Cursor Phase 25 — Smoke ===\n");

  await test("cursor position center", async () => {
    const cursor = new MockCursorReader();
    cursor.setPosition(400, 300);
    const ctx = makeContext(cursor, new MockFocusReader());
    const { environment } = await ctx.getEnvironmentSnapshot();
    assert(environment.cursor.available === "AVAILABLE", "avail");
    assert(environment.cursor.x === 400, "x");
    assert(environment.cursor.coordinateSpace === "cocoa-global-bottom-left", "space");
  });

  await test("cursor movement requires two samples", async () => {
    const policy = new CursorProximityPolicy();
    const motion = new CursorMotionTracker();
    const s1 = { x: 0, y: 0, observedAt: 1000 };
    const prev = motion.record(s1);
    const m1 = computeCursorMotion(s1, prev, policy);
    assert(m1.moving === null, "first sample moving null");
    const s2 = { x: 50, y: 0, observedAt: 1100 };
    const prev2 = motion.record(s2);
    const m2 = computeCursorMotion(s2, prev2, policy);
    assert(m2.moving === true, "moving after delta");
    assert((m2.velocity ?? 0) > 0, "velocity");
  });

  await test("distanceToSophie UNKNOWN without anchor", async () => {
    const cursor = new MockCursorReader();
    cursor.setPosition(100, 100);
    const ctx = makeContext(cursor, new MockFocusReader());
    const { environment } = await ctx.getEnvironmentSnapshot();
    assert(environment.cursor.distanceToSophie === null, "unknown distance");
    assert(environment.cursor.nearby === null, "nearby null not false");
  });

  await test("focused window AX mock", async () => {
    const focus = new MockFocusReader();
    const ctx = makeContext(new MockCursorReader(), focus);
    const { environment } = await ctx.getEnvironmentSnapshot();
    assert(environment.focusedWindow.available === "AVAILABLE", "focus");
    assert(environment.focusedWindow.focused?.applicationName === "Safari", "app");
  });

  await test("AX permission denied → PERMISSION_REQUIRED path", async () => {
    const focus = new MockFocusReader();
    focus.setStatus("PERMISSION_REQUIRED");
    const ctx = makeContext(new MockCursorReader(), focus);
    const { environment } = await ctx.getEnvironmentSnapshot();
    assert(
      environment.focusedWindow.available === "PERMISSION_REQUIRED" ||
        environment.focusedWindow.reason != null,
      "honest permission",
    );
  });

  await test("audio UNAVAILABLE — Spotify open ≠ playing", async () => {
    const ctx = makeContext(new MockCursorReader(), new MockFocusReader());
    const { environment } = await ctx.getEnvironmentSnapshot();
    assert(environment.audio.available === "UNAVAILABLE", "audio");
    assert(environment.audio.playing === null, "playing null");
  });

  await test("cursor unavailable honest", async () => {
    const cursor = new MockCursorReader();
    cursor.setUnavailable(true);
    const ctx = makeContext(cursor, new MockFocusReader());
    const { environment } = await ctx.getEnvironmentSnapshot();
    assert(environment.cursor.available === "UNAVAILABLE", "unavail");
  });

  await test("conversation reference priority unchanged", async () => {
    const resolver = new ReferenceResolver({ allowEnvironment: true });
    const entities = new EntityTracker();
    const amb = resolver.resolve("ferme-le", entities, {
      openApplications: ["Chrome", "Safari"],
    });
    assert(amb.status === "ambiguous", "clarify multi");
  });

  await test("environment changes bounded", async () => {
    const cursor = new MockCursorReader();
    const ctx = makeContext(cursor, new MockFocusReader());
    for (let i = 0; i < 100; i++) {
      cursor.setPosition(100 + i, 200);
      await ctx.getEnvironmentSnapshot();
    }
    assert(ctx.getEnvironmentChangeHistory().length <= 64, "bounded");
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
