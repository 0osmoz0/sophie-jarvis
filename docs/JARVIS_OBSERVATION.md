# JARVIS Observation Layer — Phase 2

READ ONLY is the fundamental constraint of this phase.

```
Mac
 ↓
Observation Layer
 ↓
ObservationSnapshot
 ↓
JarvisCore (system.observe)
 ↓
Sophie / future AI
```

JARVIS may **observe**. JARVIS must not **act**.

---

## What is observed

| Domain | Source | Phase 2 reality |
|--------|--------|-----------------|
| System | Node `os` | platform, arch, hostname, CPU model/cores/speed, total/free memory, uptime |
| Battery | — | **Not available** (no portable API without native/shell) |
| Processes | — | **Unavailable** (listing would need shell/`ps` or native bindings) |
| Applications | — | **Unavailable** (would need AppleScript / Accessibility / native) |
| Active app | — | **null** |
| User activity | — | **UNKNOWN** (idle APIs need native bindings) |
| Files | `fs.readdir` / `fs.stat` | Only paths **explicitly configured**; default **none** |
| Screen | — | `available: false`, **no capture**, `imageData: null` |

Unreachable values are always `null` or marked `unavailable` / `permission_required` — **never invented**.

---

## What is NOT observed

- Keystroke content, key codes, typed text
- Mouse coordinates or click streams
- Window contents / OCR
- Screen pixels / screenshots
- Camera / microphone audio-video
- Full-disk inventory
- Network traffic / remote hosts
- Browser history
- Mail, SMS, calls, contacts
- Arbitrary process control data beyond a future approved read API

---

## Permissions

| Capability | Permission needed? | Phase 2 stance |
|------------|--------------------|----------------|
| Basic `os.*` metadata | None | Used |
| Process list | Often TCC / shell | **Not implemented** → `unavailable` |
| Frontmost / open apps | Accessibility / AppleScript | **Not implemented** → `unavailable` |
| Idle time | Native input API | **Not implemented** → `UNKNOWN` |
| File path listing | Filesystem read on configured paths | Used only if paths configured (default empty) |
| Screen Recording | macOS Screen Recording | **Not requested** |

Permissions are never bypassed. If macOS would require a special grant, we return `permission_required` or `unavailable` and document why.

---

## What remains inaccessible

- Live process table
- GUI application list / active application
- True user idle/active from HID
- Battery percent
- Display geometry / multi-monitor layout
- Screen frames
- Downloads / Desktop / Documents (until explicitly configured in a later approved step)

---

## Retention

| Stored | Where | Duration |
|--------|-------|----------|
| Last `ObservationSnapshot` | In-memory cache only | Short TTL (default 2s) |
| Screenshots | Never | — |
| Key history | Never | — |
| Personal file contents | Never (metadata listing only if configured) | — |
| Disk database | Never | — |

Cache is temporary, non-persistent, process-local.

---

## Data minimization

JARVIS collects only what the Core needs for situational awareness scaffolding:

1. Prefer `null` / `unavailable` over guessing.
2. Default FileObserver watches **zero** paths.
3. No Screen Recording prompt.
4. No shell, no `child_process`, no write APIs.
5. `system.observe` is RiskLevel **LOW** and still goes through `PermissionManager`.

---

## Tool surface

```
Intent { tool: "system.observe", arguments: {} }
  → JarvisCore
  → PermissionManager (LOW → allow)
  → system.observe
  → ObservationService.snapshot()
  → ObservationSnapshot
```

---

## Safety confirmation

Phase 2 adds **observation**, not control:

- no exec/spawn/shell
- no clicks, keystrokes, mouse control
- no file create/modify/delete (user files)
- no installs, network clients, LLM, camera, mic, SMS, calls

Await human validation before Phase 3 (any write / action capability).
