# sophie-jarvis

**JARVIS Core** — fondation logicielle indépendante pour l’exécution contrôlée d’outils.

Ce dépôt n’est **pas** Sophie. Sophie vit dans un autre repository ; l’intégration se fera plus tard via `SophieBridge`.

## Phase 1 → Phase 8

- **Phase 1–5** : Core, observation, files, applications, macOS app backend
- **Phase 6** : Screen / window observation
- **Phase 7** : User activity & presence (aggregate idle)
- **Phase 8** : Controlled typed action execution (`action.*`) — no shell

Voir `docs/`, notamment [JARVIS_ACTION_EXECUTION.md](docs/JARVIS_ACTION_EXECUTION.md).

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
npx --yes tsx tools/jarvis-screen-observation-smoke.ts
npx --yes tsx tools/jarvis-screen-observation-audit.ts
npx --yes tsx tools/jarvis-user-activity-smoke.ts
npx --yes tsx tools/jarvis-user-activity-audit.ts
npx --yes tsx tools/jarvis-action-execution-smoke.ts
npx --yes tsx tools/jarvis-action-execution-audit.ts
```
