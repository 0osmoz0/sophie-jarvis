# JARVIS Context Awareness — Phase 11

> Le contexte informe JARVIS. Le contexte ne décide jamais à sa place.

```
                       USER
                         │
                         ▼
                  JarvisRuntime
                         │
                         ▼
                   IntentRouter / LLM
                         │
                         ▼
                  IntentValidator
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
        ACTION INTENT          CONTEXT INTENT
             │                       │
             ▼                       ▼
       ActionPlanner          ContextService
             │                       │
             ▼                       ▼
      Risk / Permission       ContextSnapshot
             │                       │
             ▼                       ▼
       Confirmation           ResponseFormatter
             │                       │
             └───────────┬───────────┘
                         ▼
                       USER
```

---

## ContextSnapshot

Structure unifiée, **informative uniquement** :

| Domaine | Contenu typique |
|---------|-----------------|
| `system` | OS, arch, CPU, mémoire, uptime |
| `applications` | apps réellement en cours + active |
| `screen` | displays, fenêtres (métadonnées), fenêtre active |
| `activity` | état idle / actif, `idleSeconds` |
| `presence` | présence dérivée + confidence |
| `files` | chemins configurés (observation), pas le contenu |

Chaque domaine porte un `status` explicite.

---

## ContextService

Façade de **lecture à la demande** sur :

- `ObservationService`
- `ApplicationService`
- `ScreenService`
- `UserActivityService`

Ne crée pas d’observers. Ne déclenche **aucune** action.

Interdit dans ce module : `node:fs`, `child_process`, shell, osascript, CGEvent, caméra, micro, `fetch`, polling agressif.

---

## Statuts : UNAVAILABLE vs UNKNOWN vs PERMISSION_REQUIRED

| Status | Signification |
|--------|----------------|
| `available` | Données observées réellement |
| `unavailable` | Service / backend non branché ou hors périmètre |
| `unknown` | Observé mais état indéterminé (ex. activité) |
| `permission_required` | Blocage macOS / policy |
| `error` | Échec d’appel — pas de valeur inventée |

**Règle** : si le status n’est pas `available`, ne pas fabriquer d’apps, fenêtres, présence, batterie, etc.

---

## Tool `system.context`

- Risk : `LOW`
- Read-only
- Arguments optionnels : `{ query: ContextQueryKind }`
- Queries : `system.context` | `system.status` | `application.status` | `screen.status` | `user.status`

Pipeline :

```
Intent → JarvisCore → PermissionManager → ContextTool → ContextService → ContextSnapshot
```

---

## LLM intents (read-only)

| Phrase (ex.) | Intent |
|--------------|--------|
| « qu'est-ce qui se passe sur mon Mac ? » | `system.context` |
| « mon ordinateur va bien ? » | `system.status` |
| « qu'est-ce qui est ouvert ? » | `application.status` |
| « qu'est-ce qui est affiché ? » | `screen.status` |
| « je suis inactif depuis combien de temps ? » | `user.status` |

Ces intents ont un **payload vide**. Ils ne créent **pas** de plan d’action.

« ferme tout » reste `needs_clarification` — ce n’est pas du contexte.

---

## Runtime

`JarvisRuntime` accepte `contextService` optionnel. Sur intent `context`, il appelle `ContextService.getSnapshot` puis `ContextFormatter` / `ResponseFormatter.contextMessage`.

Le LLM n’a **pas** d’accès direct aux APIs système.

---

## Privacy

Ne jamais stocker dans le snapshot / audit contexte :

- screenshots
- mots de passe
- contenu de fenêtres (texte)
- clipboard
- frappe clavier
- coordonnées souris
- contenu de fichiers personnels

L’audit contexte enregistre des **statuts de domaines** et la latence, pas les payloads riches.

---

## Sécurité

- Aucune action automatique depuis le contexte (CPU high ≠ kill app)
- Toute action future : Intent → Plan → Risk → Permission → Confirmation → Execute
- Audits : `tools/jarvis-context-audit.ts`, `tools/jarvis-context-security-audit.ts`

---

## Performances

Mesures : `contextSnapshotMs`, `systemMs`, `applicationMs`, `screenMs`, `activityMs`, `totalMs`.

Pas de polling permanent — snapshot **on demand** uniquement.

---

## Tests

```bash
npm run smoke:context
npm run audit:context
npm run audit:context-security
```
