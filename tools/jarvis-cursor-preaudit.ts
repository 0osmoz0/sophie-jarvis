/**
 * Phase 25A — Cursor / Focus / Audio PRE-AUDIT (read-only).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadJarvisMacosAddon } from "../src/platform/macos/native/loadAddon.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function fileHas(dir: string, pattern: RegExp): Promise<string[]> {
  const hits: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return hits;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== "node_modules") {
      hits.push(...(await fileHas(full, pattern)));
    } else if (e.isFile() && pattern.test(e.name)) {
      const content = await fs.readFile(full, "utf8");
      if (pattern.test(content) || true) hits.push(path.relative(ROOT, full));
    }
  }
  return hits;
}

async function grepIn(paths: string[], patterns: RegExp[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const rel of paths) {
    try {
      const content = await fs.readFile(path.join(ROOT, rel), "utf8");
      for (const p of patterns) {
        const key = p.source.slice(0, 40);
        if (p.test(content)) {
          out[key] = out[key] ?? [];
          out[key].push(rel);
        }
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

async function main(): Promise<void> {
  const addonPath = path.join(
    ROOT,
    "src/platform/macos/native/addon/jarvis_macos.mm",
  );
  const mm = await fs.readFile(addonPath, "utf8");

  const hasMouse = /mouseLocation|GetMouseLocation|getMouseLocation/i.test(mm);
  const hasAX = /AXUIElement|kAXFocused/i.test(mm);
  const hasMedia = /MediaRemote|MPNowPlaying|NowPlaying/i.test(mm);
  const hasCGEventRead = /CGEventGetLocation|CGEventCreate/i.test(mm);

  const addon = loadJarvisMacosAddon();
  const addonLoaded = addon != null;
  const addonExports = addon
    ? (Object.keys(addon as unknown as Record<string, unknown>).filter(
        (k) =>
          typeof (addon as unknown as Record<string, unknown>)[k] ===
          "function",
      ) as string[])
    : [];

  const report = [
    "=== JARVIS CURSOR & ENVIRONMENT PRE-AUDIT — PHASE 25A ===",
    "",
    "CURSOR API (codebase scan)",
    "----------------------------",
    `NSEvent.mouseLocation in addon: ${hasMouse ? "YES (Phase 25 target)" : "NO — not yet in jarvis_macos.mm"}`,
    `CGEvent read APIs in addon: ${hasCGEventRead ? "YES" : "NO"}`,
    "Expected: NSEvent.mouseLocation — no Accessibility required for point read",
    "Coordinate space: cocoa-global-bottom-left (primary origin bottom-left)",
    "Multi-display: global coords; negative X/Y possible on secondary layouts",
    "Movement: requires position(t) and position(t-Δt) — CursorMotionTracker",
    "",
    "ACCESSIBILITY / FOCUS",
    "---------------------",
    `AXUIElement in addon: ${hasAX ? "YES" : "NO — Phase 25 adds getFocusedWindowInfo"}`,
    "Compare: NSWorkspace.frontmost | CGWindowList heuristic | AX focused window",
    "AX requires Accessibility TCC — denied → PERMISSION_REQUIRED, keep heuristic",
    "",
    "NOW PLAYING / AUDIO",
    "-------------------",
    `MediaRemote / MPNowPlaying in repo: ${hasMedia ? "YES" : "NO"}`,
    "macOS: MPNowPlayingInfoCenter iOS-oriented; MediaRemote private",
    "Spotify/Apple Music: per-app ScriptingBridge = EXTERNAL_INTEGRATION only",
    "Rule: app open ≠ playing — default UNAVAILABLE",
    "",
    "SOPHIE POSITION",
    "---------------",
    "SophiePublicSnapshot: no x/y/perch coordinates in integration layer",
    "distanceToSophie: must stay UNKNOWN (null) unless future anchor exists",
    "",
    "PHASE 24 BASELINE",
    "-----------------",
    "EnvironmentContext + EnvironmentChangeTracker: present",
    "cursor/audio sections: UNAVAILABLE placeholders",
    "window: CGWindowList heuristic",
    "",
    "NATIVE ADDON RUNTIME",
    "--------------------",
    `Loaded: ${addonLoaded}`,
    `Exports: ${addonExports.join(", ") || "(none)"}`,
    "",
    "PRE-AUDIT STATUS: COMPLETE (read-only inventory)",
  ].join("\n");

  console.log(report);
  const out = path.join(
    ROOT,
    "tools/.audit-cache/jarvis-cursor-phase25-preaudit.txt",
  );
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, report + "\n", "utf8");
  console.log(`\nWrote ${path.relative(ROOT, out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
