/**
 * Phase 26 — Sophie environment consumer performance (measured only).
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
} from "../src/context/index.js";

async function main(): Promise<void> {
  console.log("\n=== JARVIS Sophie Environment Performance — Phase 26 ===\n");

  const backend = new MockApplicationBackend();
  backend.register({
    id: "s",
    name: "Safari",
    bundleId: "com.apple.Safari",
    running: true,
    active: true,
  });
  backend.setRunning("s", true);
  const registry = new ApplicationRegistry();
  registry.register({ id: "s", name: "Safari", bundleId: "com.apple.Safari" });
  const consumer = new SophieEnvironmentConsumer({
    anchorProvider: new StaticSophieAnchorProvider({ x: 100, y: 100, width: 80, height: 100 }),
  });
  const ctx = new ContextService({
    applications: new MockApplicationService({
      registry,
      backend,
      audit: new MemoryApplicationAuditLog(),
    }),
    screen: new ScreenService({ backend: new MockScreenBackend() }),
    cursorReader: new MockCursorReader(),
    focusReader: new MockFocusReader(),
    sophieEnvironmentConsumer: consumer,
  });

  const t0 = Date.now();
  const env = await ctx.getEnvironmentSnapshot();
  const envMs = Date.now() - t0;

  const t1 = Date.now();
  const anchor = consumer.getAnchorProvider().read();
  const anchorMs = Date.now() - t1;

  const t2 = Date.now();
  const snap = consumer.consume(env);
  const consumeMs = Date.now() - t2;

  const t3 = Date.now();
  await ctx.getSophieEnvironmentSnapshot();
  const totalMs = Date.now() - t3;

  console.log(`environmentSnapshotMs: ${envMs}`);
  console.log(`sophieAnchorMs: ${anchorMs}`);
  console.log(`consumeDeriveMs: ${consumeMs}`);
  console.log(`getSophieEnvironmentSnapshotMs: ${totalMs}`);
  console.log(`relationAvailable: ${snap.relation.available}`);
  console.log("\n(Mock path — measured values only; no invented SLA)\n");
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(console.error);
}
