/**
 * Phase 26 — Sophie environment SIMULATION (10_000 snapshots).
 * MODE: SIMULATION — not real observations.
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
} from "../src/context/index.js";

const N = 10_000;

async function main(): Promise<void> {
  console.log("\n=== JARVIS SOPHIE ENVIRONMENT SIMULATION — PHASE 26 ===\n");
  console.log("MODE: SIMULATION\n");

  const cursor = new MockCursorReader();
  const focus = new MockFocusReader();
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
    {
      id: "display-1",
      width: 1920,
      height: 1080,
      scaleFactor: 1,
      isPrimary: false,
      bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
    },
  ]);

  const backend = new MockApplicationBackend();
  backend.register({
    id: "safari",
    name: "Safari",
    bundleId: "com.apple.Safari",
    running: true,
    active: true,
  });
  backend.setRunning("safari", true);
  const registry = new ApplicationRegistry();
  registry.register({ id: "safari", name: "Safari", bundleId: "com.apple.Safari" });
  const apps = new MockApplicationService({
    registry,
    backend,
    audit: new MemoryApplicationAuditLog(),
  });
  apps.mockSetRunning("safari", true);

  const withAnchor = new StaticSophieAnchorProvider({
    x: 700,
    y: 400,
    width: 120,
    height: 160,
  });
  const noAnchor = new UnavailableSophieAnchorProvider();

  let consumer = new SophieEnvironmentConsumer({ anchorProvider: withAnchor });
  const ctx = new ContextService({
    applications: apps,
    screen: new ScreenService({ backend: screenBackend }),
    cursorReader: cursor,
    focusReader: focus,
    sophieEnvironmentConsumer: consumer,
    cursorPolicy: consumer.toCursorProximityPolicy(),
  });

  const dist: Record<string, number> = {};
  let nearCount = 0;
  let unknownNear = 0;
  let edgeCount = 0;

  for (let i = 0; i < N; i++) {
    const scenario = i % 20;
    dist[`s${scenario}`] = (dist[`s${scenario}`] ?? 0) + 1;

    switch (scenario) {
      case 0:
        cursor.setPosition(756, 491);
        break;
      case 1:
        cursor.setPosition(756 + (i % 5), 491);
        break;
      case 2:
        cursor.setPosition(720, 420);
        break;
      case 3:
        cursor.setPosition(100, 100);
        break;
      case 4:
        withAnchor.setPosition(0, 400);
        consumer = new SophieEnvironmentConsumer({ anchorProvider: withAnchor });
        break;
      case 5:
        withAnchor.setPosition(1470, 400);
        break;
      case 6:
        withAnchor.setPosition(0, 0);
        break;
      case 7:
        cursor.setPosition(-500, 400);
        withAnchor.setPosition(-900, 400);
        break;
      case 8:
        focus.setStatus("AVAILABLE");
        break;
      case 9:
        focus.setStatus("PERMISSION_REQUIRED");
        break;
      case 10:
        focus.setStatus("AVAILABLE");
        break;
      case 11:
        cursor.setUnavailable(true);
        break;
      case 12:
        cursor.setUnavailable(false);
        consumer = new SophieEnvironmentConsumer({ anchorProvider: noAnchor });
        break;
      case 13:
        consumer = new SophieEnvironmentConsumer({ anchorProvider: withAnchor });
        withAnchor.setPosition(700, 400);
        break;
      case 14:
        cursor.setPosition(700 + (i % 30), 400);
        break;
      default:
        cursor.setPosition(i % 1512, i % 982);
    }

    // Re-bind consumer when swapped (lightweight)
    const snap = await consumer.consume(await ctx.getEnvironmentSnapshot());
    if (snap.relation.near === true) nearCount += 1;
    if (snap.relation.near === null) unknownNear += 1;
    if (snap.edges.nearCorner === true || snap.edges.nearLeftEdge === true) {
      edgeCount += 1;
    }
  }

  console.log(`snapshots: ${N}`);
  console.log(`distribution: ${JSON.stringify(dist)}`);
  console.log(`nearCount: ${nearCount}`);
  console.log(`unknownNear: ${unknownNear}`);
  console.log(`edgeHits: ${edgeCount}`);
  console.log("\nMODE: SIMULATION");
  console.log("(Synthetic Sophie environment traffic — not real observations)\n");
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
