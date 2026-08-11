# sophie-jarvis

**JARVIS Core** — fondation logicielle indépendante pour l’exécution contrôlée d’outils.

Ce dépôt n’est **pas** Sophie. L’intégration se fait via le contrat Phase 12 (signaux).

## Phase 1 → Phase 15

- **Phase 1–14** : Core → … → sécurité proactive (assess)
- **Phase 15** : monitoring de sécurité cohérent (corrélation + alertes, sans action)

Voir `docs/JARVIS_SECURITY.md`.

## Démarrage rapide

```bash
npm install
npm run build:native   # optionnel, darwin + Xcode
npm run jarvis
# monitoring optionnel :
JARVIS_SECURITY_MONITOR=1 npm run jarvis
```

## Validation

```bash
npx tsc --noEmit
npm run smoke:security
npm run smoke:security-monitor
npm run audit:security-monitor
npm run sim:security-monitor
```
