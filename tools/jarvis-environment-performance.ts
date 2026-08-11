/**
 * Phase 25 — Environment performance (measured on-demand only).
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
import { ContextService } from "../src/context/index.js";

async function main(): Promise<void> {
  console.log("\n=== JARVIS Environment Performance — Phase 25 ===\n");
  const cursor = new MockCursorReader();
  const backend = new MockApplicationBackend();
  backend.register({ id: "s", name: "Safari", bundleId: "com.apple.Safari", running: true, active: true });
  backend.setRunning("s", true);
  const registry = new ApplicationRegistry();
  registry.register({ id: "s", name: "Safari", bundleId: "com.apple.Safari" });
  const ctx = new ContextService({
    applications: new MockApplicationService({ registry, backend, audit: new MemoryApplicationAuditLog() }),
    screen: new ScreenService({ backend: new MockScreenBackend() }),
    cursorReader: cursor,
    focusReader: new MockFocusReader(),
  });
  const { timing } = await ctx.getEnvironmentSnapshot();
  console.log(`cursorMs: ${timing.cursorMs}`);
  console.log(`focusMs: ${timing.focusMs ?? "null"}`);
  console.log(`axMs: ${timing.axMs ?? "null"}`);
  console.log(`windowMs: ${timing.windowMs}`);
  console.log(`screenMs: ${timing.screenMs}`);
  console.log(`totalContextMs: ${timing.totalContextMs}`);
  console.log("\n(Mock path — live native STATUS: UNAVAILABLE unless build:native)\n");
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(console.error);
}
