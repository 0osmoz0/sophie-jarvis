# sophie-jarvis

**JARVIS Core** — fondation logicielle indépendante pour l’exécution contrôlée d’outils.

Ce dépôt n’est **pas** Sophie. Sophie vit dans un autre repository ; l’intégration se fera plus tard via `SophieBridge`.

## Phase 1 + Phase 2

- **Phase 1** : Core (Intent → PermissionManager → Tool)
- **Phase 2** : Observation READ ONLY (`system.observe`)

Voir [docs/JARVIS_ARCHITECTURE.md](docs/JARVIS_ARCHITECTURE.md) et [docs/JARVIS_OBSERVATION.md](docs/JARVIS_OBSERVATION.md).

## Validation

```bash
npm install
npx tsc --noEmit
npx --yes tsx tools/jarvis-core-smoke.ts
npx --yes tsx tools/jarvis-observation-smoke.ts
npx --yes tsx tools/jarvis-observation-audit.ts
```
