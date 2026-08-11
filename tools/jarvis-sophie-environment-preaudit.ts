/**
 * Phase 26A — Sophie Environment Consumer PRE-AUDIT (read-only).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const report = [
    "=== SOPHIE ENVIRONMENT CONSUMER PRE-AUDIT ===",
    "",
    "## SOPHIE POSITION",
    "globalX: null",
    "globalY: null",
    "width: null",
    "height: null",
    "center: null",
    "anchor: NONE in this repo",
    "source: SophiePublicSnapshot has no geometry (state/activity/hints only)",
    "reliable: false",
    "freshness: UNKNOWN",
    "evidence: src/integration/types.ts SophiePublicSnapshot — no x/y/width/height",
    "evidence: no perch/drag/physics/NSPanel/sprite coords in jarvis codebase",
    "",
    "## CURSOR",
    "available: AVAILABLE when native/mock cursor reader present (Phase 25)",
    "x/y: cocoa-global-bottom-left",
    "moving: null until two samples",
    "velocity/direction: from Δdistance/Δtime",
    "distanceToSophie: null (no Sophie anchor)",
    "cursorNearSophie: null",
    "cursorApproaching: null",
    "cursorLeaving: null",
    "",
    "## SCREEN",
    "display: EnvironmentContext.screen (displays, primary, scale, bounds)",
    "nearLeft/Right/Top/Bottom/Corner: REQUIRES Sophie anchor — currently UNKNOWN",
    "",
    "## WINDOW",
    "activeWindow: CGWindow heuristic (Phase 24)",
    "focusedWindow: AX when Accessibility granted (Phase 25)",
    "matchesHeuristic: FocusedWindowContext.matchesHeuristic",
    "accessibility: AVAILABLE | PERMISSION_REQUIRED | UNAVAILABLE",
    "",
    "## APPLICATION",
    "activeApplication: EnvironmentContext.application.active",
    "runningApplications: recentApplications + runningCount",
    "",
    "## SESSION",
    "locked: session.locked (null stays UNKNOWN)",
    "userPresent: often null",
    "activityLevel: ACTIVE | RECENTLY_ACTIVE | IDLE | UNKNOWN",
    "idleSeconds: IOKit HID when available",
    "",
    "## PERCH / SURFACE",
    "currentPerch: MISSING",
    "currentSurface: MISSING",
    "surfaceValid: null",
    "inVoid: null",
    "hang/fall: MISSING — do not invent collision",
    "",
    "## AUDIO",
    "available: UNAVAILABLE (Phase 25 conclusion unchanged)",
    "playing/paused/track/artist: null — open ≠ playing",
    "",
    "## CHANGES",
    "EnvironmentChangeTracker: CURSOR_*, FOCUSED_WINDOW_CHANGED,",
    "  ACTIVE_APPLICATION_CHANGED, SCREEN_CHANGED, AUDIO_* (audio never without proof)",
    "",
    "## ACCESSIBILITY",
    "available / required / denied / unknown — capability report only, no TCC bypass",
    "",
    "PRE-AUDIT STATUS: COMPLETE (read-only)",
    "CONCLUSION: Sophie anchor unavailable in-repo → distance/edges UNKNOWN until",
    "  external provider injects SophieEnvironmentAnchor.",
  ].join("\n");

  console.log(report);
  const out = path.join(
    ROOT,
    "tools/.audit-cache/jarvis-sophie-environment-phase26-preaudit.txt",
  );
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, report + "\n", "utf8");
  console.log(`\nWrote ${path.relative(ROOT, out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
