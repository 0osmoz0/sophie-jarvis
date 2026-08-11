/**
 * Phase 25 — Cursor privacy audit.
 */
import { EnvironmentChangeTracker, emptyEnvironment } from "../src/context/index.js";

async function main(): Promise<void> {
  console.log("\n=== JARVIS Cursor — Privacy Audit ===\n");
  const failures: string[] = [];
  const t = new EnvironmentChangeTracker(16);
  for (let i = 0; i < 50; i++) {
    const e = emptyEnvironment(i);
    e.cursor.x = i * 10;
    e.cursor.y = i * 5;
    e.cursor.available = "AVAILABLE";
    t.observe(e);
  }
  const dump = JSON.stringify(t.list());
  for (const bad of ["password", "Uint8Array", "screenshot", "clipboard", "keystroke"]) {
    if (dump.includes(bad)) failures.push(`change log contains ${bad}`);
  }
  if (t.list().length > 64) failures.push("unbounded history");
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("  ✓ no audio/clipboard/keystroke in change log");
    console.log("  ✓ bounded cursor event history\n");
  }
}

main();
