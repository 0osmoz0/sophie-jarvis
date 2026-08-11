# JARVIS macOS Native Capabilities — Phase 13

> Capacités macOS réelles via addon N-API optionnel. Permissions explicites. Jamais de shell.

```
ApplicationService / ScreenService / UserActivityService
                    │
                    ▼
         MacOS*Backend (TypeScript)
                    │
         optional load jarvis_macos.node
                    │
                    ▼
    AppKit / CoreGraphics / IOKit / ImageIO
```

---

## Build

```bash
npm run build:native
# produit build/Release/jarvis_macos.node
```

Sans binaire compilé : les backends restent `UNAVAILABLE` (honnête).

---

## APIs natives

| Domaine | API |
|---------|-----|
| Applications | `NSWorkspace` / `NSRunningApplication` |
| Fermeture | `terminate` gracieuse uniquement (pas `forceTerminate`) |
| Idle agrégé | IOKit `HIDIdleTime` |
| Écrans | `NSScreen` |
| Fenêtres | `CGWindowListCopyWindowInfo` |
| Session | `CGSessionCopyCurrentDictionary` (champs absents → `null`) |
| Capture | `CGDisplayCreateImage` + ImageIO PNG |

Interdit : shell, osascript, CGEvent injection, kill/SIGKILL, robotjs, caméra, micro.

---

## Permissions macOS (TCC)

| Permission | Usage |
|------------|--------|
| **Accessibility** | Peut être requise pour certaines infos frontmost selon le contexte |
| **Screen Recording** | Requise pour `screen.capture` et parfois listes de fenêtres riches |

JARVIS ne contourne jamais TCC. Erreurs → `PERMISSION_REQUIRED`.

---

## Capacités

### Activées (avec addon chargé)

- application active / list (running) / open / close (graceful)
- user activity idleSeconds → ACTIVE/IDLE/UNKNOWN via service
- screen.info / windows / activeWindow / session
- screen.capture (HIGH + confirmation + in-memory, retention 0)

### Toujours contraintes

- Apps critiques (Finder, Dock, …) → DENYLIST
- `userPresent` / `locked` → `boolean \| null` si non fiable
- idle ≠ absence physique
- contexte informatif uniquement (pas d’auto-kill)

---

## Tests

```bash
npm run smoke:macos-native          # mocks
JARVIS_MACOS_NATIVE_TESTS=1 npm run smoke:macos-native
npm run audit:macos-native
```

---

## Sécurité

Voir `tools/jarvis-macos-native-audit.ts`.

Sophie (Phase 12) n’accède pas aux APIs macOS — signaux uniquement.
