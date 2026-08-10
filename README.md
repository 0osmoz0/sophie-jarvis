# sophie-jarvis

**JARVIS Core** — fondation logicielle indépendante pour l’exécution contrôlée d’outils.

Ce dépôt n’est **pas** Sophie. Sophie vit dans un autre repository ; l’intégration se fera plus tard via `SophieBridge`.

## Phase 1 (actuelle)

Architecture modulaire, typée et **inoffensive** :

- `JarvisCore` + `Intent` structurée
- `Tool` / `ToolRegistry`
- `PermissionManager` + `RiskLevel`
- `TaskManager` + `EventBus` + `Context`
- Outil unique : `system.info` (LOW, lecture seule)
- `MockAIProvider` (aucun LLM externe)
- `SophieBridge` découplé (stub)

Aucune capacité dangereuse (shell, réseau, caméra, fichiers, etc.).

## Documentation

Voir [docs/JARVIS_ARCHITECTURE.md](docs/JARVIS_ARCHITECTURE.md).

## Validation

```bash
npm install
npx tsc --noEmit
npx --yes tsx tools/jarvis-core-smoke.ts
```
