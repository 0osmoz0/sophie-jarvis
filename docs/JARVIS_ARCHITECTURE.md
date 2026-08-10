# JARVIS Architecture — Phase 1 (Core Foundation)

This repository hosts **JARVIS Core**, an independent, modular foundation for controlled tool execution. It is **not** a copy of Sophie and does not embed Sophie’s behavioral systems (personality, memory, goals, animations, etc.).

Sophie remains in a separate repository. Integration will happen later through `SophieBridge` only.

---

## Phase 2 note

An **Observation Layer** (`src/observation/`) provides READ ONLY host snapshots via `system.observe` (LOW). See [JARVIS_OBSERVATION.md](./JARVIS_OBSERVATION.md). Process/app/idle/screen capture remain unavailable without shell or privileged APIs — intentionally.

## Phase 3 note

A **File Control Layer** (`src/files/`) provides sandboxed file actions via `file.*` tools. All mutations go through `FileService` after `FilePolicy` checks. See [JARVIS_FILE_CONTROL.md](./JARVIS_FILE_CONTROL.md).

## Phase 4 note

An **Application Control Layer** (`src/applications/`) provides lifecycle tools (`application.list|info|active|open|close`) with denylist and no UI automation. Real open/close await a native backend; tests use `MockApplicationService`. See [JARVIS_APPLICATION_CONTROL.md](./JARVIS_APPLICATION_CONTROL.md).

---

## Design principle

JARVIS Core is intentionally **inoffensive** in Phase 1. No camera, microphone, screen capture, keyboard, mouse, terminal, shell, file mutation, network, browser, Gmail, SMS, calls, GPS, antivirus, real LLM, vision, STT, or TTS.

We only build the architecture that will allow those capabilities later under strict permission control.

---

## Mandatory control pipeline

```
User / UI / Voice
       ↓
    Intent
       ↓
  JarvisCore
       ↓
PermissionManager
       ↓
     Tool
       ↓
    Result
       ↓
    Sophie   (via SophieBridge — future)
```

**Never:**

```
LLM → shell
```

A future LLM may only **propose** an `Intent`. Execution always goes through `JarvisCore` → `PermissionManager` → `Tool`.

---

## Directory layout

```
src/
├── core/
│   ├── JarvisCore.ts      # Intent orchestrator
│   ├── EventBus.ts        # Typed lifecycle events
│   ├── TaskManager.ts     # Task state machine
│   ├── Context.ts         # Read-only situational snapshot
│   ├── types.ts           # Shared types
│   └── index.ts           # Public exports
├── tools/
│   ├── Tool.ts            # Tool interface
│   ├── ToolRegistry.ts    # Register / lookup (no execution)
│   └── systemInfo.ts      # Only real tool (LOW, read-only)
├── permissions/
│   ├── RiskLevel.ts       # LOW | MEDIUM | HIGH | CRITICAL
│   └── PermissionManager.ts
├── intelligence/
│   ├── AIProvider.ts      # Interface only
│   └── MockAIProvider.ts  # Offline stub
├── security/
│   └── SecurityEvent.ts   # Scaffolding
└── integration/
    └── SophieBridge.ts    # Decoupled adapter stub
```

---

## Components

### RiskLevel

| Level    | Phase 1 rule                                      |
|----------|---------------------------------------------------|
| LOW      | May execute automatically                         |
| MEDIUM   | User confirmation required                        |
| HIGH     | Explicit confirmation required                    |
| CRITICAL | Never automatic; denied (override reserved later) |

Rules can be strengthened later (allowlists, dual control, audit).

### Tool

Minimum contract:

- `id`, `name`, `description`, `riskLevel`
- `execute(args)`
- optional `validate(args)`

### ToolRegistry

`register` / `unregister` / `get` / `list`. **Does not execute tools.**

### system.info (first tool)

Returns only: OS platform, architecture, hostname (if available), JARVIS app version, timestamp.

- Risk: **LOW**
- Uses Node `os` module only
- No shell, `exec`, `spawn`, or arbitrary filesystem access

### PermissionManager

Receives a tool execution request, reads `RiskLevel`, returns:

- `allow`
- `require_confirmation`
- `deny`

**No tool may bypass PermissionManager.** Only `JarvisCore` calls `execute()` after approval.

### TaskManager

Tracks tasks with statuses:

`pending` → `running` | `waiting_confirmation` | `cancelled` | `failed`  
`waiting_confirmation` → `running` | `cancelled` | `failed`  
`running` → `completed` | `failed` | `cancelled`

Does **not** run system commands.

### EventBus

Typed events (Phase 1):

- `task_created`
- `task_started`
- `task_waiting_confirmation`
- `task_completed`
- `task_failed`

Extensible for future events (`security_alert`, `file_changed`, …) without changing bus internals.

### Context

Read-only snapshot: `timestamp`, `userPresence`, `activeApplication`, `securityState`, `currentTask`.

Values may be `null`, `unknown`, or demos. **No real surveillance.**

### JarvisCore

1. Receive structured `Intent` `{ tool, arguments }`
2. Resolve Tool
3. Validate
4. Ask PermissionManager
5. Create Task
6. Execute if allowed (or wait / fail)
7. Capture result
8. Emit events (+ notify SophieBridge stub)

No natural-language understanding.

### AIProvider

Interface: `generate()`, `analyze()`, `classify()`.

`MockAIProvider` for tests — offline, no Ollama/OpenAI. May propose an Intent; **never** executes a Tool.

### SophieBridge

Future adapter: JARVIS → SophieBridge → Sophie external API / event bus.

Phase 1: `NullSophieBridge` records messages in memory. No Sophie imports, no animations, no behavioral-state coupling.

### SecurityEvent

Scaffolding only — no live monitoring in Phase 1.

---

## Security invariants

Phase 1 is **safe by design**. Automated checks (`tools/security-invariants.ts`) verify the source tree does not introduce:

- `exec` / `spawn` / shell
- `eval` / `new Function`
- camera / microphone / display capture
- keyboard / mouse automation libraries
- network clients / fetch / external LLM SDKs
- arbitrary file write/delete
- SMS / telephony / Gmail
- direct Sophie behavioral imports

Runtime dependencies: **none** (dev-only: TypeScript, tsx, `@types/node`).

---

## Validation

```bash
npm install
npx tsc --noEmit
npx --yes tsx tools/jarvis-core-smoke.ts
```

---

## Independence from Sophie

- This repository does not depend on Sophie’s codebase.
- No behavioral logic is duplicated here.
- Connection will be API/bridge-based in a later phase.
- Phase 2+ capabilities require **human validation** before any system access is added.

**STOP after Phase 1.** Do not add PC control, files, browser, vision, voice, or phone without explicit approval.
