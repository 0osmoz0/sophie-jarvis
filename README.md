## Phase 1 → Phase 25

- **Phase 1–24** : Core → … → Environmental Awareness
- **Phase 25** : Cursor & Environment Interaction (`0.25.0`) — COMPLETE

Voir `docs/JARVIS_CURSOR.md`.

## Validation Phase 25

```bash
npx tsc --noEmit
npm run preaudit:cursor
npm run smoke:cursor
npm run audit:cursor
npm run audit:cursor-security
npm run audit:cursor-privacy
npm run sim:cursor
npm run perf:environment
```

Curseur : `NSEvent.mouseLocation` via addon natif (rebuild `npm run build:native`).  
Focus fenêtre : AX (`getFocusedWindowInfo`) — Accessibility requise.  
Now Playing : **UNAVAILABLE** (open ≠ playing).  
Sophie proximity : **UNKNOWN** (pas de coordonnées Sophie globales).
