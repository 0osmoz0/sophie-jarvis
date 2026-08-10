# sophie-jarvis

**JARVIS Core** — fondation logicielle indépendante pour l’exécution contrôlée d’outils.

Ce dépôt n’est **pas** Sophie. Sophie vit dans un autre repository ; l’intégration se fera plus tard via `SophieBridge`.

## Phase 1 + Phase 2 + Phase 3 + Phase 4

- **Phase 1** : Core (Intent → PermissionManager → Tool)
- **Phase 2** : Observation READ ONLY (`system.observe`)
- **Phase 3** : File control sandbox (`file.*`)
- **Phase 4** : Application lifecycle (`application.*`, no UI automation)

Voir [docs/JARVIS_ARCHITECTURE.md](docs/JARVIS_ARCHITECTURE.md), [docs/JARVIS_OBSERVATION.md](docs/JARVIS_OBSERVATION.md), [docs/JARVIS_FILE_CONTROL.md](docs/JARVIS_FILE_CONTROL.md), [docs/JARVIS_APPLICATION_CONTROL.md](docs/JARVIS_APPLICATION_CONTROL.md).

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
```
