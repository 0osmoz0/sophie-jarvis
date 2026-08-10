# JARVIS Application Control — Phase 4

JARVIS can manage **application lifecycle** only:

`LIST` · `INFO` · `ACTIVE` · `OPEN` · `CLOSE`

It still **cannot** control application content (clicks, typing, UI scripting, browser automation, etc.).

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
   macOS / Mock
       ↓
    Result
```

No Tool may bypass `ApplicationService`.

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

| Capability | Phase 4 default |
|------------|-----------------|
| list/info from registry | Available |
| frontmost (`active`) | `UNAVAILABLE` without Accessibility/native API (not bypassed) |
| open | `UNAVAILABLE` without approved native backend (no `open`/`osascript`/shell) |
| close | `UNAVAILABLE` without approved native backend (no `kill`/`SIGKILL`) |

`MockApplicationService` simulates open/close/active **in memory** for tests so we never close a user’s real apps during CI/smoke.

System tests: set `JARVIS_APP_SYSTEM_TESTS=1` (still returns unavailable until a native backend exists).

---

## Audit log

In-memory only: timestamp, taskId, toolId, action, application, bundleId, riskLevel, confirmation, result.

Never stores window contents, typed text, cookies, or personal data.

---

## No UI automation (critical)

Phase 4 must **not** include:

robotjs, nut.js, CGEvent, Accessibility UI actions, AppleScript UI scripting, clicks, keystrokes, clipboard automation, OCR, screen capture, browser automation.

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

- No shell / child_process / osascript
- No force-kill
- No UI / keyboard / mouse control
- No Sophie direct access to ApplicationService
- Real open/close await a future approved native macOS backend

**Do not start Phase 5** without human validation.
