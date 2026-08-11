/**
 * Phase 25 — Cursor / environment structural audit + failure matrix.
 */
import {
  computeCursorMotion,
  CursorMotionTracker,
  CursorProximityPolicy,
  emptyEnvironment,
  EnvironmentChangeTracker,
} from "../src/context/index.js";

const MATRIX: Array<{ situation: string; check: () => boolean; expected: string }> = [
  {
    situation: "Cursor API unavailable",
    check: () => emptyEnvironment().cursor.available === "UNAVAILABLE",
    expected: "UNAVAILABLE",
  },
  {
    situation: "Spotify open ≠ playing",
    check: () => emptyEnvironment().audio.playing === null,
    expected: "playing null",
  },
  {
    situation: "Single sample ≠ moving",
    check: () => {
      const m = computeCursorMotion(
        { x: 1, y: 1, observedAt: 100 },
        null,
        new CursorProximityPolicy(),
      );
      return m.moving === null;
    },
    expected: "moving null",
  },
  {
    situation: "Sophie distance UNKNOWN",
    check: () => {
      const m = computeCursorMotion(
        { x: 1, y: 1, observedAt: 200 },
        { x: 0, y: 0, observedAt: 100 },
        new CursorProximityPolicy(),
      );
      return m.distanceToSophie === null;
    },
    expected: "distance null",
  },
  {
    situation: "Environment event flood bounded",
    check: () => {
      const t = new EnvironmentChangeTracker(8);
      for (let i = 0; i < 200; i++) {
        const e = emptyEnvironment(i);
        e.cursor.x = i;
        e.cursor.available = "AVAILABLE";
        t.observe(e);
      }
      return t.list().length <= 8;
    },
    expected: "max 8",
  },
];

async function main(): Promise<void> {
  console.log("\n=== JARVIS Cursor — Audit + Failure Matrix ===\n");
  let fail = 0;
  for (const row of MATRIX) {
    const ok = row.check();
    console.log(`  ${ok ? "✓" : "✗"} ${row.situation} → ${row.expected}`);
    if (!ok) fail += 1;
  }
  const motion = new CursorMotionTracker();
  motion.record({ x: 0, y: 0, observedAt: 0 });
  const m = computeCursorMotion(
    { x: 100, y: 0, observedAt: 500 },
    { x: 0, y: 0, observedAt: 0 },
    new CursorProximityPolicy(),
  );
  if (!m.moving) {
    console.log("  ✗ fast movement should be moving");
    fail += 1;
  } else {
    console.log("  ✓ fast movement detected");
  }
  console.log(fail ? `\n${fail} failures\n` : "\n  ✓ cursor audit clean\n");
  if (fail) process.exitCode = 1;
}

main();
