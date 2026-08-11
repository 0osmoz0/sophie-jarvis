# JARVIS — Environmental Awareness (Phase 24)

Version: **0.24.0**

## Principe

```text
OBSERVE → NORMALIZE → CONTEXTUALIZE → EXPOSE
```

Jamais :

```text
OBSERVE → DECIDE → ACT
```

## EnvironmentContext

`ContextService.getEnvironmentSnapshot()` produit un snapshot cohérent :

- screen (displays, primary, scale, bounds, globalBounds)
- application (active ≠ running)
- window (metadata only — pas de capture / OCR)
- userActivity (idleSeconds, activityLevel) — **IDLE ≠ ABSENT**
- session (locked / userPresent — null reste UNKNOWN, jamais forcé à false)
- cursor (**UNAVAILABLE** — aucune API fiable Phase 24)
- audio (**UNAVAILABLE** — Spotify ouvert ≠ playing)
- permissions (report only — jamais de demande TCC)

Chaque section expose `observedAt`, `available`, `source`.

## Freshness

`ContextFreshness` : FRESH / STALE / UNKNOWN (`ageMs`).

Seuil indicative : fresh ≤ 2s, stale ≥ 15s.

## Change detection

`EnvironmentChangeTracker` borné (64) :

APPLICATION_CHANGED, WINDOW_CHANGED, SCREEN_CHANGED,
SESSION_CHANGED, USER_ACTIVITY_CHANGED, AUDIO_STATE_CHANGED

Aucun comportement automatique.

## Sources

| Domaine | Source | Fiabilité |
|---------|--------|-----------|
| Displays | NSScreen / Mock | Fiable si bridge |
| Apps | NSWorkspace via backend.list | Fiable si bridge |
| Windows | CGWindowList | Indicatif (focus heuristique) |
| Idle | IOKit HIDIdleTime | Fiable (durée) |
| Session | CGSessionCopyCurrentDictionary | locked si présent ; userPresent souvent null |
| Cursor | — | UNAVAILABLE |
| Audio now-playing | — | UNAVAILABLE / EXTERNAL_INTEGRATION |

## Permissions

Accessibility / Screen Recording / Microphone : états AVAILABLE / REQUIRED / DENIED / UNKNOWN.

ContextService **ne demande jamais** une permission.

## Conversation / Decision / Memory

Priorité :

EXPLICIT USER MESSAGE > CONVERSATION REFERENCE > CURRENT ENVIRONMENT > MEMORY > LLM

Environment = evidence, jamais autorisation.

## Sophie

Aucun BehaviorBrain. Aucune animation. Snapshot disponible pour phases futures.

## Privacy

Pas de screenshot auto, OCR, audio, clipboard, keystrokes, historique illimité.

## Tests

```bash
npx tsx tools/jarvis-environment-preaudit.ts
npx tsx tools/jarvis-environment-smoke.ts
npx tsx tools/jarvis-environment-audit.ts
npx tsx tools/jarvis-environment-security-audit.ts
npx tsx tools/jarvis-environment-privacy-audit.ts
npx tsx tools/jarvis-environment-simulation.ts
```

## Limitations

- Pas de curseur réel
- Pas de now-playing
- Fenêtre active heuristique
- Pas de polling permanent (on-demand)
