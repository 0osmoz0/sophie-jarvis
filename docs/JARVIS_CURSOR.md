# JARVIS — Cursor & Environment Interaction (Phase 25)

Version: **0.25.0**

## Principe

```text
NATIVE → OBSERVE → NORMALIZE → VALIDATE → EnvironmentContext → (optional event)
```

Jamais : CURSOR/WINDOW/AUDIO → DECISION → ACTION

## Curseur

| Élément | Détail |
|---------|--------|
| Source | `getMouseLocation` — `NSEvent.mouseLocation` |
| Permission | Généralement **sans** Accessibility |
| Espace | `cocoa-global-bottom-left` (points logiques) |
| Mouvement | `position(t)` vs `position(t-Δt)` — 1 seul point → `moving: null` |
| Proximité Sophie | `distanceToSophie: null` (UNKNOWN) — pas d'ancre Sophie |

## Focus fenêtre

| Source | Fiabilité | Permission |
|--------|-----------|------------|
| AX `kAXFocusedWindowAttribute` | Meilleure si TCC OK | Accessibility |
| CGWindowList heuristic | Indicatif | Screen Recording souvent |

`focusedWindow.matchesHeuristic` compare AX vs heuristique Phase 24.

## Audio / Now Playing

**UNAVAILABLE** en 0.25.0 — audit macOS : pas d'API publique fiable.

Spotify ouvert ≠ `playing: true`.

## Changements environnementaux

Événements bornés (64) : `CURSOR_MOVED`, `CURSOR_ENTERED_PROXIMITY`, `FOCUSED_WINDOW_CHANGED`, etc.

Aucun déclenchement DecisionEngine / animations Sophie.

## Tests

```bash
npx tsx tools/jarvis-cursor-preaudit.ts
npx tsx tools/jarvis-cursor-smoke.ts
npx tsx tools/jarvis-cursor-simulation.ts
```

Rebuild natif : `npm run build:native`
