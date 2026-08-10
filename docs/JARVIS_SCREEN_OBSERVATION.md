# JARVIS Screen & Window Observation — Phase 6

JARVIS can **observe** the graphical environment. It still **cannot control** it (no clicks, keys, UI scripting).

> JARVIS does not continuously record or upload the user's screen.

```
Mac
│
├── System Observation
├── Application Observation
└── Screen Observation
    ├── Displays
    ├── Windows
    ├── Active Window
    ├── Session State
    └── Explicit Screenshot
         ▼
   ScreenService → JarvisCore
```

Pipeline:

```
Intent → JarvisCore → PermissionManager → ScreenTool
  → ScreenPolicy → ScreenService → ScreenBackend → macOS / Mock
```

---

## Models

**ScreenInfo** — id, width, height, scaleFactor, isPrimary, bounds  
**WindowInfo** — id, title?, applicationName?, bundleId?, bounds?, minimized?, visible?, active?  
**SessionInfo** — locked / userPresent as `boolean | null` (never invented)

Unavailable values stay `null` or explicit `UNAVAILABLE` / `PERMISSION_REQUIRED`.

---

## Tools & risk

| Tool | Risk | Notes |
|------|------|--------|
| `screen.info` | LOW | Display geometry only |
| `screen.windows` | LOW | Metadata only — no pixels/OCR |
| `screen.activeWindow` | LOW | May be UNAVAILABLE / PERMISSION_REQUIRED |
| `screen.session` | LOW | null when unknown |
| `screen.capture` | HIGH | Explicit confirmation; never automatic |

---

## Backends

- `MockScreenBackend` — tests (in-memory)
- `MacOSScreenBackend` — optional N-API / ScreenCaptureKit bridge; **UNAVAILABLE** without it
- Never: shell `screencapture`, scripting bridges, UI automation

### Capability status

`AVAILABLE` | `UNAVAILABLE` | `PERMISSION_REQUIRED`

Screen Recording may be required for windows/capture when a bridge exists — never bypassed.

---

## Capture privacy & retention

- Explicit invoke only (PermissionManager HIGH → confirmation)
- No background / scheduled / loop capture
- No disk save by default
- No upload / telemetry
- Retention = **0** (service does not keep screenshot buffers)
- Audit logs never contain image bytes

---

## Limitations

- Without compiled native bridge, real display/window/capture stay UNAVAILABLE
- No mouse/keyboard/clipboard automation
- No OCR / face recognition
- No continuous surveillance

**Do not start Phase 7** without human validation.
