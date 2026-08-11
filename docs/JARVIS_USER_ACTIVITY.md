# JARVIS User Activity & Presence — Phase 7

JARVIS observes **aggregate user inactivity**. It does **not** record keyboard or mouse input.

> IDLE does not prove physical absence.

```
Mac
│
├── System Observation
├── Application Observation
├── Screen Observation
└── User Activity Observation
    ├── Active
    ├── Idle
    ├── Returned
    └── Unknown
         ▼
   ObservationSnapshot
         ▼
   JarvisCore
```

Pipeline:

```
Intent → JarvisCore → PermissionManager → PresenceTool
  → UserActivityPolicy → UserActivityService → UserActivityBackend → macOS / Mock
```

---

## Activity model

Statuses (software signals only):

| Status | Meaning |
|--------|---------|
| `ACTIVE` | Aggregate idle below threshold |
| `IDLE` | Aggregate idle at/above threshold |
| `JUST_BECAME_IDLE` | Transition edge: was active, now idle |
| `JUST_RETURNED` | Transition edge: was idle, activity resumed |
| `UNKNOWN` | Backend unavailable / non-finite idle |

`UserActivitySnapshot`:

```ts
{
  status: UserActivityStatus
  idleSeconds: number | null
  lastActivityAt: number | null  // current-state calc only — not a history log
  observedAt: number
  source: "native" | "mock" | "unavailable"
}
```

Never recorded: key content, keycodes, mouse coordinates/trajectories, clicks, clipboard, camera, mic, screenshots, window history timelines.

---

## Idle model & thresholds

Default behavioural thresholds (not security triggers):

- `idleThresholdSeconds = 30`
- `returnThresholdSeconds = 2` (hysteresis)

State machine:

```
ACTIVE --(idle >= idleThreshold)--> JUST_BECAME_IDLE --> IDLE
IDLE   --(idle <= returnThreshold)--> JUST_RETURNED --> ACTIVE
```

Hysteresis avoids `ACTIVE ↔ IDLE` chatter on microscopic idle changes.

These thresholds **must not** launch security actions, captures, alerts, or calls.

---

## Presence model

`UserPresenceSnapshot`:

```ts
{
  presence: "PRESENT" | "IDLE" | "UNKNOWN"
  confidence: number
  reason: string
}
```

- `PRESENT` — recent aggregate activity (software)
- `IDLE` — no aggregate activity detected (**not** “person absent”)
- `UNKNOWN` — observation unavailable

Without a camera, JARVIS cannot know if someone is physically in front of the Mac.

---

## Confidence

Software indicators only — not physical measurements:

| Activity | Presence | Confidence |
|----------|----------|------------|
| ACTIVE / JUST_RETURNED | PRESENT | 1.0 |
| IDLE / JUST_BECAME_IDLE | IDLE | 0.6 |
| UNKNOWN | UNKNOWN | 0.0 |

---

## Tools & permissions

| Tool | Risk | Returns |
|------|------|---------|
| `user.activity` | LOW | `{ status, idleSeconds, source }` |
| `user.presence` | LOW | `{ presence, confidence, reason }` |

Read-only. No mutations. Policy forbids security actions, automatic capture, camera, and audio input.

---

## Events (signals only)

Internal EventBus events:

- `user_activity_changed`
- `user_became_idle`
- `user_returned`

They must **not** directly: animate, `requestState`, capture, message, call, launch apps, or modify files. The Brain decides.

Prefer on-demand reads. If polling is ever required: configurable interval, no raw input, clean shutdown, never aggressive.

---

## Native implementation (macOS)

`MacOSUserActivityBackend` loads the optional Phase 13 N-API bridge (`jarvis_macos.node`) that returns **only** aggregate idle seconds via IOKit `HIDIdleTime`.

Forbidden: event taps, IOHID key/mouse hooks, AppleScript/osascript, shell `exec`/`spawn`, clipboard, camera, mic.

Without the bridge → honest `UNAVAILABLE` / `UNKNOWN`. Never fake activity.

Opt-in real read: `JARVIS_MACOS_NATIVE_TESTS=1` or `JARVIS_MACOS_USER_ACTIVITY_TESTS=1`.

See `docs/JARVIS_MACOS_NATIVE.md`.

---

## ObservationSnapshot

Optional fields (backward compatible):

- `activitySignal` — Phase 7 `UserActivitySnapshot`
- `userPresence` — Phase 7 `UserPresenceSnapshot`

Phase 2 `userActivity` coarse field remains.

---

## Audit privacy

Audit stores: timestamp, toolId, taskId, status, **idleBucket**, capability, result.

Buckets: `0-5s` | `5-30s` | `30-60s` | `1-5m` | `5m+`

Never: exact idle when unnecessary, keys, mouse events, coordinates, typed content.

---

## Limitations

- No physical presence proof (idle ≠ absent)
- Native idle requires compiled addon (`npm run build:native`)
- Observation only — no security automation from activity signals
- IDLE never auto-triggers kill/close/delete
