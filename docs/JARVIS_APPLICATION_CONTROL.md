# JARVIS Application Control — Phase 4

JARVIS can manage **application lifecycle** only:

`LIST` · `INFO` · `ACTIVE` · `OPEN` · `CLOSE`

It still **cannot** control application content (clicks, typing, UI scripting, browser automation, etc.).

## Pipeline

```
User / future AI
       ↓
    Intent
       ↓
  JarvisCore
       ↓
PermissionManager
       ↓
ApplicationTool
       ↓
ApplicationPolicy
       ↓
ApplicationService
       ↓
ApplicationBackend
       ↓
MacOS / Mock
       ↓
    Result
```

No Tool may bypass `ApplicationService`. No generic command execution API exists.

---

## Identity & resolver

Applications are resolved from an **explicit registry** by:

- `name` (or alias)
- `bundleId`
- `path` (`.app` only, must be registered)
- `id`

Command-like input is rejected:

```text
Google Chrome && rm -rf ...
```

→ `INVALID_INPUT` (never treated as a shell command).

Never invent applications. Unknown → `NOT_FOUND`.

---

## Registry

`ApplicationRegistry` holds configured apps only.

Phase 4 does **not** shell-scan the disk (`find` / `mdfind` / `ls` / `ps` forbidden).

---

## Policy & denylist

**Cannot close/open** (denylist):

Finder, Dock, WindowServer, loginwindow, launchd, SystemUIServer

**Blocked path prefixes:** `/System/*`, `/Library/*`, `/private/*`, `/usr/*`, `/bin/*`, `/sbin/*`

**Not in Phase 4:** shutdown, restart, logout, sleep.

---

## Risk levels

| Tool | Risk | Confirmation |
|------|------|--------------|
| `application.list` | LOW | No |
| `application.info` | LOW | No |
| `application.active` | LOW | No |
| `application.open` | MEDIUM | Yes |
| `application.close` | MEDIUM | Yes (denylist → denied) |

Confirmations reuse `PermissionManager` / `confirmTask` and are bound to a single task (tool + identity + args). Approving Chrome does **not** approve Terminal.

---

## macOS permissions & availability

| Capability | Without N-API bridge | With approved NSWorkspace bridge |
|------------|----------------------|----------------------------------|
| list/info from registry | Available | Available |
| system discovery | `UNAVAILABLE` | Via bridge |
| frontmost (`active`) | `UNAVAILABLE` | May need Accessibility → `PERMISSION_REQUIRED` |
| open | `UNAVAILABLE` | Typed open by bundleId/path |
| close | `UNAVAILABLE` | Graceful terminate only (no force-kill) |

`MockApplicationService` / `MockApplicationBackend` simulate lifecycle **in memory** for tests.

System tests: `JARVIS_MACOS_SYSTEM_TESTS=1` (never closes personal apps; mutations only if bridge present — still skipped for safety).

---

## Native macOS Backend (Phase 5)

```
ApplicationService
       ↓
ApplicationBackend (interface)
       ↓
MacOSApplicationBackend  ──optional──► N-API bridge (NSWorkspace)
       ↓
MockApplicationBackend (tests)
```

### APIs intended (when bridge is approved/compiled)

- **NSWorkspace** / AppKit equivalents for open + running apps
- **Graceful terminate** only (`terminate`, never force-quit)
- Frontmost app query (may require Accessibility)

### Not used

- shell / process spawning
- scripting bridges
- force process termination
- UI automation (clicks, keys, AX scripting)

### Capability status

```ts
backend.getCapabilityStatus("openApplication")
// { capability, status: "AVAILABLE" | "UNAVAILABLE" | "PERMISSION_REQUIRED", permission?, reason? }
```

Without the optional bridge module (`src/platform/macos/native/`), status is **UNAVAILABLE**. Security preferred over fake success.

### Audit fields (Phase 5)

Optional: `backend`, `capability`, `nativeStatus` — never window/clipboard/screen content.

---

## Audit log

In-memory only: timestamp, taskId, toolId, action, application, bundleId, riskLevel, confirmation, result (+ optional backend metadata).

Never stores window contents, typed text, cookies, or personal data.

---

## No UI automation (critical)

Phases 4–5 must **not** include:

robotjs, nut.js, CGEvent, Accessibility UI actions, scripting UI automation, clicks, keystrokes, clipboard automation, OCR, screen capture, browser automation.

---

## Examples (structured intents)

**Liste mes applications** (LOW):

```json
{ "tool": "application.list", "arguments": {} }
```

**Est-ce que Chrome est ouvert ?** (LOW — from registry/mock running state):

```json
{ "tool": "application.info", "arguments": { "name": "Google Chrome" } }
```

**Ouvre Chrome** (MEDIUM — confirmation):

```json
{ "tool": "application.open", "arguments": { "name": "Google Chrome" } }
```

Then `confirmTask(taskId)`.

**Ferme Chrome** (MEDIUM — confirmation; denylist apps always denied):

```json
{ "tool": "application.close", "arguments": { "name": "Google Chrome" } }
```

---

## Limitations

- No shell / process spawning / scripting bridges
- No force-kill
- No UI / keyboard / mouse control
- No Sophie direct access to ApplicationService
- Phase 13: real open/close/active via optional `jarvis_macos.node` (`npm run build:native`)
- Without the compiled addon, backends remain `UNAVAILABLE` (honest)

See `docs/JARVIS_MACOS_NATIVE.md`.
