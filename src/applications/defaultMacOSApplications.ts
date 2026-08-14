/**
 * Explicit allowlist seed for CLI / demos — not shell discovery.
 * Registry remains the source of truth for open/close.
 */
import type { ApplicationRegistry } from "./ApplicationRegistry.js";
import type { RegisteredApplication } from "./types.js";

/** Small curated set of common user applications (macOS). */
export const DEFAULT_MACOS_APPLICATIONS: readonly RegisteredApplication[] = [
  {
    id: "safari",
    name: "Safari",
    bundleId: "com.apple.Safari",
    path: "/Applications/Safari.app",
  },
  {
    id: "finder",
    name: "Finder",
    bundleId: "com.apple.finder",
    path: "/System/Library/CoreServices/Finder.app",
  },
  {
    id: "terminal",
    name: "Terminal",
    bundleId: "com.apple.Terminal",
    path: "/System/Applications/Utilities/Terminal.app",
  },
  {
    id: "notes",
    name: "Notes",
    bundleId: "com.apple.Notes",
    path: "/System/Applications/Notes.app",
  },
  {
    id: "mail",
    name: "Mail",
    bundleId: "com.apple.mail",
    path: "/System/Applications/Mail.app",
  },
  {
    id: "calendar",
    name: "Calendar",
    bundleId: "com.apple.iCal",
    path: "/System/Applications/Calendar.app",
  },
  {
    id: "messages",
    name: "Messages",
    bundleId: "com.apple.MobileSMS",
    path: "/System/Applications/Messages.app",
  },
  {
    id: "preview",
    name: "Preview",
    bundleId: "com.apple.Preview",
    path: "/System/Applications/Preview.app",
  },
  {
    id: "textedit",
    name: "TextEdit",
    bundleId: "com.apple.TextEdit",
    path: "/System/Applications/TextEdit.app",
  },
  {
    id: "calculator",
    name: "Calculator",
    bundleId: "com.apple.calculator",
    path: "/System/Applications/Calculator.app",
  },
  {
    id: "chrome",
    name: "Google Chrome",
    bundleId: "com.google.Chrome",
    path: "/Applications/Google Chrome.app",
    aliases: ["chrome"],
  },
  {
    id: "vscode",
    name: "Visual Studio Code",
    bundleId: "com.microsoft.VSCode",
    path: "/Applications/Visual Studio Code.app",
    aliases: ["vscode", "code", "vs code"],
  },
] as const;

export function seedDefaultMacOSApplications(
  registry: ApplicationRegistry,
): number {
  let n = 0;
  for (const app of DEFAULT_MACOS_APPLICATIONS) {
    if (registry.get(app.id)) continue;
    registry.register({ ...app });
    n += 1;
  }
  return n;
}
