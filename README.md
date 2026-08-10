# sophie-jarvis

**JARVIS Core** — fondation logicielle indépendante pour l’exécution contrôlée d’outils.

Ce dépôt n’est **pas** Sophie. Sophie vit dans un autre repository ; l’intégration se fera plus tard via `SophieBridge`.

## Phase 1 → Phase 5

- **Phase 1** : Core
- **Phase 2** : Observation READ ONLY
- **Phase 3** : File control sandbox
- **Phase 4** : Application lifecycle tools + policy
- **Phase 5** : `ApplicationBackend` + `MacOSApplicationBackend` (native bridge optional)

Voir la documentation dans `docs/`.

## Validation

```bash
npm install
npx tsc --noEmit
npx --yes tsx tools/jarvis-core-smoke.ts
npx --yes tsx tools/jarvis-observation-smoke.ts
npx --yes tsx tools/jarvis-observation-audit.ts
npx --yes tsx tools/jarvis-file-control-smoke.ts
npx --yes tsx tools/jarvis-file-control-audit.ts
npx --yes tsx tools/jarvis-application-control-smoke.ts
npx --yes tsx tools/jarvis-application-control-audit.ts
npx --yes tsx tools/jarvis-macos-application-backend-smoke.ts
npx --yes tsx tools/jarvis-macos-backend-audit.ts
```
