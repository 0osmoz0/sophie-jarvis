/**
 * Phase 26 — Sophie environment structural audit.
 */
import {
  computeSophieCursorRelation,
  computeSophieEdges,
  emptySophieAnchor,
  StaticSophieAnchorProvider,
  SophieEnvironmentConsumer,
  emptyEnvironment,
} from "../src/context/index.js";

async function main(): Promise<void> {
  console.log("\n=== JARVIS Sophie Environment — Audit ===\n");
  const failures: string[] = [];

  const empty = emptySophieAnchor();
  if (empty.available || empty.x != null) failures.push("empty anchor must be unavailable");

  const provider = new StaticSophieAnchorProvider({ x: 100, y: 100, width: 50, height: 50 });
  const anchor = provider.read();
  const cursor = {
    available: "AVAILABLE" as const,
    observedAt: Date.now(),
    source: "mock",
    coordinateSpace: "cocoa-global-bottom-left" as const,
    x: 1000,
    y: 1000,
    displayId: "display-0",
    moving: false,
    velocity: 0,
    direction: null,
    distanceToSophie: null,
    nearby: null,
    approaching: null,
    leaving: null,
    ageMs: 0,
    freshness: { observedAt: Date.now(), ageMs: 0, status: "FRESH" as const },
  };
  const far = computeSophieCursorRelation(cursor, anchor);
  if (far.near !== false) failures.push("far should be near=false when both available");

  const edges = computeSophieEdges(anchor, emptyEnvironment().screen);
  if (edges.available !== false) failures.push("edges without screen should be unavailable");

  const consumer = new SophieEnvironmentConsumer({
    anchorProvider: new StaticSophieAnchorProvider({ x: 0, y: 0, width: 10, height: 10 }),
  });
  if (typeof consumer.getSophieEnvironmentSnapshot !== "function") {
    failures.push("missing unique API");
  }

  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("  ✓ Sophie environment audit clean\n");
  }
}

main();
