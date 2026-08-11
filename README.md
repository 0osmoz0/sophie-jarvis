# sophie-jarvis

**JARVIS Core** — fondation logicielle indépendante pour l’exécution contrôlée d’outils.

Ce dépôt n’est **pas** Sophie. Sophie vit dans un autre repository ; l’intégration se fera plus tard via `SophieBridge`.

## Phase 1 → Phase 11

- **Phase 1–9** : Core → observation → files → apps → macOS → screen → presence → actions → LLM intents
- **Phase 10** : Interactive runtime + CLI (`npm run jarvis`)
- **Phase 11** : Context awareness + unified system snapshot (read-only)

Voir `docs/JARVIS_CONTEXT.md`.

## Démarrage rapide

```bash
npm install
npm run jarvis
# diagnostic LLM :
npm run jarvis -- --health
```

## Validation

```bash
npx tsc --noEmit
npx --yes tsx tools/jarvis-core-smoke.ts
# … phases 2–10 …
npx --yes tsx tools/jarvis-context-smoke.ts
npx --yes tsx tools/jarvis-context-audit.ts
npx --yes tsx tools/jarvis-context-security-audit.ts
```
