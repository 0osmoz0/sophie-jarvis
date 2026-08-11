## Phase 1 → Phase 16

- **Phase 1–15** : Core → … → security monitor
- **Phase 16** : mémoire long terme locale (informe seulement)

Voir `docs/JARVIS_MEMORY.md`.

## Démarrage rapide

```bash
npm install
npm run build:native   # optionnel, darwin + Xcode
npm run jarvis
```

## Validation

```bash
npx tsc --noEmit
npm run smoke:memory
npm run audit:memory
npm run sim:memory
```
