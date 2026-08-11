## Phase 1 → Phase 18

- **Phase 1–17** : Core → … → conversation multi-tour
- **Phase 18** : Decision & Reasoning Engine (`0.18.0`)

Voir `docs/JARVIS_DECISION.md`.

## Démarrage rapide

```bash
npm install
npm run build:native   # optionnel, darwin + Xcode
npm run jarvis
```

## Validation

```bash
npx tsc --noEmit
npm run smoke:decision
npm run audit:decision
npm run audit:decision-security
npm run sim:decision
```
