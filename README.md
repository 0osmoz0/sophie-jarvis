## Phase 1 → Phase 22

- **Phase 1–21** : Core → … → Production Hardening
- **Phase 22** : Ollama Production Reliability (`0.22.0`) — COMPLETE

Voir `docs/JARVIS_OLLAMA_RELIABILITY.md`.

## Démarrage rapide

```bash
npm install
npm run build:native   # optionnel, darwin + Xcode
npm run jarvis
JARVIS_LLM_PROVIDER=mock npm run jarvis
```

## Validation

```bash
npx tsc --noEmit
npm run preaudit:ollama
npm run smoke:ollama-reliability
npm run test:ollama-failure-matrix
npm run sim:ollama-reliability
npm run audit:ollama-live
npm run audit:ollama-security
npm run audit:ollama-privacy
```
