## Phase 1 → Phase 21

- **Phase 1–20** : Core → … → Pipeline Consolidation
- **Phase 21** : Production Hardening & Observability (`0.21.0`) — COMPLETE

Voir `docs/JARVIS_OBSERVABILITY.md`.

## Démarrage rapide

```bash
npm install
npm run build:native   # optionnel, darwin + Xcode
npm run jarvis
npm run jarvis -- --timing
npm run jarvis -- --trace
npm run jarvis -- --metrics
```

## Validation

```bash
npx tsc --noEmit
npm run preaudit:production
npm run audit:observability-security
npm run audit:observability-privacy
npm run test:failure-matrix
npm run sim:chaos
npm run sim:long-session
```
