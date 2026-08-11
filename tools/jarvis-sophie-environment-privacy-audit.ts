/**
 * Phase 26 — Sophie environment privacy audit.
 */
import {
  SophieEnvironmentConsumer,
  StaticSophieAnchorProvider,
  emptySophieEnvironmentSnapshot,
} from "../src/context/index.js";

async function main(): Promise<void> {
  console.log("\n=== JARVIS Sophie Environment — Privacy Audit ===\n");
  const failures: string[] = [];
  const snap = emptySophieEnvironmentSnapshot();
  const dump = JSON.stringify(snap);
  for (const bad of [
    "screenshot",
    "Uint8Array",
    "clipboard",
    "keystroke",
    "microphone buffer",
    "password",
  ]) {
    if (dump.toLowerCase().includes(bad.toLowerCase())) {
      failures.push(`snapshot contains ${bad}`);
    }
  }
  const consumer = new SophieEnvironmentConsumer({
    anchorProvider: new StaticSophieAnchorProvider({ x: 1, y: 2, width: 3, height: 4 }),
  });
  const a = consumer.consume({
    environment: (await import("../src/context/index.js")).emptyEnvironment(),
    timing: {
      screenMs: null,
      applicationMs: null,
      windowMs: null,
      activityMs: null,
      sessionMs: null,
      cursorMs: null,
      focusMs: null,
      axMs: null,
      audioMs: null,
      aggregationMs: null,
      totalContextMs: 0,
    },
    changes: [],
  });
  if (a.surface.onValidSurface === false) {
    failures.push("must not invent onValidSurface=false");
  }
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("  ✓ no screenshots/audio/clipboard/keystrokes in snapshot");
    console.log("  ✓ surface UNKNOWN not coerced to false\n");
  }
}

main();
