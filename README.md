# sophie-jarvis

**JARVIS Core** — fondation logicielle indépendante pour l’exécution contrôlée d’outils.

Ce dépôt n’est **pas** Sophie. Sophie vit dans un autre repository ; l’intégration se fait via le **contrat Phase 12** (`SophieAPI` / signaux).

## Phase 1 → Phase 12

- **Phase 1–11** : Core → … → Context Awareness
- **Phase 12** : Sophie Integration Contract (signaux typés, pas d’exécution)

Voir `docs/JARVIS_SOPHIE_INTEGRATION.md`.

## Démarrage rapide

```bash
npm install
npm run jarvis
```

## Validation

```bash
npx tsc --noEmit
# … phases 1–11 …
npx --yes tsx tools/jarvis-integration-smoke.ts
npx --yes tsx tools/integration-contract-test.ts
npx --yes tsx tools/jarvis-integration-security-audit.ts
```
