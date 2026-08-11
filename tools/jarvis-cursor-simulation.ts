/**
 * Phase 25 — Cursor SIMULATION (5000+ events).
 * MODE: SIMULATION
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
  CursorMotionTracker,
} from "../src/context/index.js";

const N = 5_000;

async function main(): Promise<void> {
  console.log("\n=== JARVIS CURSOR SIMULATION — PHASE 25 ===\n");
  console.log("MODE: SIMULATION\n");

  const cursor = new MockCursorReader();
  const focus = new MockFocusReader();
  const backend = new MockApplicationBackend();
  backend.register({ id: "safari", name: "Safari", bundleId: "com.apple.Safari", running: true, active: true });
  backend.setRunning("safari", true);
  const registry = new ApplicationRegistry();
  registry.register({ id: "safari", name: "Safari", bundleId: "com.apple.Safari" });
  const apps = new MockApplicationService({ registry, backend, audit: new MemoryApplicationAuditLog() });
  apps.mockSetRunning("safari", true);
  const screen = new ScreenService({ backend: new MockScreenBackend() });

  const ctx = new ContextService({
    applications: apps,
    screen,
    cursorReader: cursor,
    focusReader: focus,
    cursorMotion: new CursorMotionTracker(),
  });

  let movingCount = 0;
  let unavailableCount = 0;
  const changes: Record<string, number> = {};

  for (let i = 0; i < N; i++) {
    if (i % 500 === 499) cursor.setUnavailable(true);
    else cursor.setUnavailable(false);

    const phase = i % 14;
    switch (phase) {
      case 0:
        cursor.setPosition(756, 491);
        break;
      case 1:
        cursor.setPosition(0, 0);
        break;
      case 2:
        cursor.setPosition(1512, 982);
        break;
      case 3:
        cursor.setPosition(-100, 400);
        break;
      case 4:
        cursor.setPosition(756 + (i % 20), 491);
        break;
      case 5:
        cursor.setPosition(756 + i % 200, 491);
        break;
      case 6:
        focus.setWindow({ id: "w", title: `T${i}`, applicationName: "Safari", bundleId: null, bounds: null });
        break;
      case 7:
        focus.setStatus("PERMISSION_REQUIRED");
        break;
      case 8:
        focus.setStatus("AVAILABLE");
        break;
      case 9:
        cursor.setUnavailable(true);
        break;
      default:
        cursor.setPosition(i % 1512, i % 982);
    }

    const r = await ctx.getEnvironmentSnapshot();
    if (r.environment.cursor.moving === true) movingCount += 1;
    if (r.environment.cursor.available === "UNAVAILABLE") unavailableCount += 1;
    for (const c of r.changes) {
      changes[c.type] = (changes[c.type] ?? 0) + 1;
    }
  }

  console.log(`events: ${N}`);
  console.log(`movingSamples: ${movingCount}`);
  console.log(`unavailableSamples: ${unavailableCount}`);
  console.log(`changeTypes: ${JSON.stringify(changes)}`);
  console.log(`history: ${ctx.getEnvironmentChangeHistory().length}`);
  console.log("\nMODE: SIMULATION");
  console.log("(Synthetic cursor/environment events — not real observations)\n");
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
