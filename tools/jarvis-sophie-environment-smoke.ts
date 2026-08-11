/**
 * Phase 26 — Sophie environment consumer smoke tests.
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
import { MockCursorReader } from "../src/platform/macos/MockCursorReader.js";
import { MockFocusReader } from "../src/platform/macos/MockFocusReader.js";
import {
  ContextService,
  SophieEnvironmentConsumer,
  StaticSophieAnchorProvider,
  UnavailableSophieAnchorProvider,
  computeSophieCursorRelation,
  computeSophieEdges,
  emptySophieAnchor,
} from "../src/context/index.js";

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
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, detail });
    console.error(`  ✗ ${name}: ${detail}`);
  }
}

function makeCtx(
  cursor: MockCursorReader,
  consumer: SophieEnvironmentConsumer,
) {
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
  registry.register({
    id: "safari",
    name: "Safari",
    bundleId: "com.apple.Safari",
  });
  const apps = new MockApplicationService({
    registry,
    backend,
    audit: new MemoryApplicationAuditLog(),
  });
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
  return new ContextService({
    applications: apps,
    screen: new ScreenService({ backend: screenBackend }),
    cursorReader: cursor,
    focusReader: new MockFocusReader(),
    sophieEnvironmentConsumer: consumer,
    cursorPolicy: consumer.toCursorProximityPolicy(),
  });
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS Sophie Environment Phase 26 — Smoke ===\n");

  await test("default anchor unavailable (honest)", async () => {
    const consumer = new SophieEnvironmentConsumer({
      anchorProvider: new UnavailableSophieAnchorProvider(),
    });
    const cursor = new MockCursorReader();
    cursor.setPosition(400, 300);
    const ctx = makeCtx(cursor, consumer);
    const snap = await ctx.getSophieEnvironmentSnapshot();
    assert(snap.anchor.available === false, "anchor false");
    assert(snap.relation.distance === null, "distance null");
    assert(snap.relation.near === null, "near null not false");
    assert(snap.signals.cursorNear === null, "signal near null");
    assert(snap.surface.onValidSurface === null, "surface null");
  });

  await test("static anchor + cursor near", async () => {
    const anchor = new StaticSophieAnchorProvider({
      x: 350,
      y: 250,
      width: 100,
      height: 100,
    });
    const consumer = new SophieEnvironmentConsumer({ anchorProvider: anchor });
    const cursor = new MockCursorReader();
    cursor.setPosition(400, 300);
    const ctx = makeCtx(cursor, consumer);
    await ctx.getEnvironmentSnapshot();
    cursor.setPosition(410, 305);
    const snap = await ctx.getSophieEnvironmentSnapshot();
    assert(snap.anchor.available === true, "anchor");
    assert(snap.relation.available === true, "relation");
    assert(snap.relation.distance != null && snap.relation.distance < 120, "near");
    assert(snap.relation.near === true, "near true");
  });

  await test("UNKNOWN not coerced to false", async () => {
    const a = emptySophieAnchor();
    assert(a.available === false, "avail");
    assert(a.x === null && a.y === null, "null coords");
    const rel = computeSophieCursorRelation(
      {
        available: "UNAVAILABLE",
        observedAt: null,
        source: "none",
        coordinateSpace: null,
        x: null,
        y: null,
        displayId: null,
        moving: null,
        velocity: null,
        direction: null,
        distanceToSophie: null,
        nearby: null,
        approaching: null,
        leaving: null,
        ageMs: null,
        freshness: { observedAt: null, ageMs: null, status: "UNKNOWN" },
      },
      a,
    );
    assert(rel.near === null, "near null");
    assert(rel.approaching === null, "approaching null");
  });

  await test("edge / corner with anchor", async () => {
    const anchor = new StaticSophieAnchorProvider({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
    }).read();
    const edges = computeSophieEdges(anchor, {
      available: "AVAILABLE",
      observedAt: Date.now(),
      source: "mock",
      displays: [
        {
          id: "display-0",
          width: 1512,
          height: 982,
          scaleFactor: 2,
          isPrimary: true,
          bounds: { x: 0, y: 0, width: 1512, height: 982 },
        },
      ],
      primaryDisplay: {
        id: "display-0",
        width: 1512,
        height: 982,
        scaleFactor: 2,
        isPrimary: true,
        bounds: { x: 0, y: 0, width: 1512, height: 982 },
      },
      width: 1512,
      height: 982,
      scaleFactor: 2,
      displayCount: 1,
      globalBounds: { x: 0, y: 0, width: 1512, height: 982 },
    });
    assert(edges.available === true, "edges");
    assert(edges.nearLeftEdge === true, "left");
    assert(edges.nearBottomEdge === true, "bottom");
    assert(edges.nearCorner === true, "corner");
  });

  await test("unique API getSophieEnvironmentSnapshot", async () => {
    const consumer = new SophieEnvironmentConsumer();
    const cursor = new MockCursorReader();
    const ctx = makeCtx(cursor, consumer);
    const a = await ctx.getSophieEnvironmentSnapshot();
    const b = await consumer.getSophieEnvironmentSnapshot(ctx);
    assert(a.anchor.available === b.anchor.available, "same API shape");
  });

  await test("AX focus in snapshot", async () => {
    const consumer = new SophieEnvironmentConsumer();
    const ctx = makeCtx(new MockCursorReader(), consumer);
    const snap = await ctx.getSophieEnvironmentSnapshot();
    assert(snap.focusedWindow != null, "focused");
  });

  await test("audio remains UNAVAILABLE", async () => {
    const consumer = new SophieEnvironmentConsumer();
    const ctx = makeCtx(new MockCursorReader(), consumer);
    const env = await ctx.getEnvironmentSnapshot();
    assert(env.environment.audio.available === "UNAVAILABLE", "audio");
    assert(env.environment.audio.playing === null, "playing null");
    assert(env.changes.every((c) => !c.type.startsWith("AUDIO_PLAYBACK")), "no fake audio events");
  });

  await test("no behavioral brain / no setInterval in consumer", async () => {
    const fs = await import("node:fs/promises");
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    for (const f of [
      "SophieEnvironmentConsumer.ts",
      "SophieEnvironmentSignals.ts",
      "SophieCursorRelation.ts",
    ]) {
      const raw = await fs.readFile(path.join(root, "src/context", f), "utf8");
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      assert(!/\bBehaviorBrain\b/.test(code), `${f} BehaviorBrain`);
      assert(!/\bsetInterval\s*\(/.test(code), `${f} setInterval`);
      assert(!/\bActionExecutor\b/.test(code), `${f} ActionExecutor`);
    }
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
