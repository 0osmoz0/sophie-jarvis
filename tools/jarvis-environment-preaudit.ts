/**
 * Phase 24 — Environment PRE-AUDIT (read-only).
 * Does not modify application code.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const report = [
    "=== JARVIS ENVIRONMENT PRE-AUDIT — PHASE 24 ===",
    "",
    "1. macOS info actually available?",
    "   Native addon: NSWorkspace apps, frontmost, IOKit idle,",
    "   NSScreen displays (bounds/scale), CGWindowList windows,",
    "   CGSessionCopyCurrentDictionary (locked; userPresent=null),",
    "   CGDisplayCreateImage capture (main display).",
    "   NO cursor API. NO ambient audio / now-playing. NO microphone in env.",
    "",
    "2. Accessible to ContextService today?",
    "   system (Node os), applications (active + registry list),",
    "   screen displays/windows/activeWindow WITHOUT bounds/scaleFactor,",
    "   activity/presence. Session NOT in ContextSnapshot.",
    "   Capture NOT in ContextSnapshot (by design).",
    "",
    "3. Accessible to Sophie?",
    "   Ephemeral signals only (lastAppHint, media events).",
    "   No native screen/window/session/idle geometry.",
    "   No perch/drag/physics positioning APIs in repo.",
    "",
    "4. CLI / tools only?",
    "   screen.session, screen.capture tools; native listRunningApplications",
    "   underused by ApplicationService.list() (registry-only).",
    "",
    "5. Accessibility required?",
    "   Frontmost / some window metadata may require Accessibility at runtime.",
    "",
    "6. Screen Recording required?",
    "   Window titles/list often; capture always.",
    "",
    "7. Microphone required?",
    "   Voice Phase 23 only — NOT environmental awareness.",
    "",
    "8. Reliable?",
    "   Node system metrics; NSScreen displays; IOKit idle duration;",
    "   NSWorkspace running/frontmost (when bridge loaded);",
    "   session.locked when key present.",
    "",
    "9. Indicative only?",
    "   Active window = first layer-0 CG window (heuristic).",
    "   Presence from idle thresholds (not physical proof).",
    "   session.userPresent always null. Window bundleId often null.",
    "   Sophie media/app hints (eventual).",
    "",
    "10. Computed multiple times?",
    "    SecurityMonitor double Context snapshot; apps list+active;",
    "    screen info+windows+activeWindow; Phase2 stubs vs native services;",
    "    ApplicationService.list registry vs backend.listApplications orphan.",
    "",
    "11. Still absent?",
    "    EnvironmentContext type; session in Context; bounds/scale in Context;",
    "    cursor; real audio/now-playing; unified freshness; change events;",
    "    running apps from NSWorkspace via Context path.",
    "",
    "PRE-AUDIT STATUS: COMPLETE (read-only)",
  ].join("\n");

  console.log(report);
  const out = path.join(
    ROOT,
    "tools/.audit-cache/jarvis-environment-phase24-preaudit.txt",
  );
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, report + "\n", "utf8");
  console.log(`\nWrote ${path.relative(ROOT, out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
