## Phase 1 → Phase 20

- **Phase 1–19** : Core → … → Natural Response
- **Phase 20** : Pipeline Consolidation & Low-Latency (`0.20.0`) — COMPLETE

Voir `docs/JARVIS_PIPELINE.md`.

## Démarrage rapide

```bash
npm install
npm run build:native   # optionnel, darwin + Xcode
npm run jarvis
npm run jarvis -- --timing
```

## Validation

```bash
npx tsc --noEmit
npm run preaudit:pipeline
npm run audit:pipeline
npm run audit:pipeline-security
npm run sim:pipeline
npm run audit:llm-perf
JARVIS_LLM_PROVIDER=mock npm run bench:interaction
```
