# JARVIS ↔ Sophie Integration Contract — Phase 12

> Sophie fournit des signaux. JARVIS conserve le contexte, la décision, les permissions et l’exécution.

```
             ┌──────────────┐
             │    SOPHIE    │
             └──────┬───────┘
                    │
                 signals
                    │
                    ▼
          ┌───────────────────┐
          │ SophieIntegration │
          └─────────┬─────────┘
                    │
             Context / Memory
                    │
                    ▼
             ┌────────────┐
             │ JARVIS     │
             │ Runtime    │
             └─────┬──────┘
                   │
          ┌────────┴────────┐
          ▼                 ▼
      Context            Actions
                              │
                        Risk/Permission
                              │
                        Confirmation
                              │
                           Execute
```

---

## Architecture

| Composant | Rôle |
|-----------|------|
| `SophieEventBus` | Bus typé in-process (pas de réseau) |
| `SophieIntegration` | Validation + mémoire éphémère + dispatch |
| `SophieAPI` | Façade publique (`emit` / `subscribe` / `getSnapshot`) |
| `SophieBridge` | Stub Phase 1 (notifications task/permission) — conservé |

Sophie **ne** peut **pas** importer / appeler `ActionExecutor`, `FileService`, `ApplicationService`, `PermissionManager`, `BehaviorBrain`, `AnimationPlayer`.

---

## Events entrants (`SophieInputEvent`)

| Type | Effet |
|------|--------|
| `user_returned` / `user_idle` / `user_became_busy` / `user_became_focused` | `lastUserSignal` |
| `pet` / `poke` / `wave` / `love` | `lastSophieInteraction` + outbound `user_interaction` |
| `app_opened` / `app_closed` | hint app + interaction |
| `media_*` / `music_*` | `lastMediaEvent` |
| `external_activity` | `lastUserSignal` |

Payloads **minimaux**. Rejet si clés interdites : `command`, `shell`, `exec`, `script`, `actionExecutor`, `goal`, `animation`, `stateOverride`, `animationOverride`, …

---

## Events sortants (`SophieOutputEvent`)

| Type | Contenu |
|------|---------|
| `behavior_started` | `behaviorId`, `timestamp` |
| `behavior_finished` | `behaviorId`, `timestamp` |
| `user_interaction` | `interactionType`, `timestamp` |
| `state_changed` | `state`, `previousState?`, `timestamp` |

Jamais exposés : scores internes, prompts LLM, tokens permission, mémoire privée.

Sophie décide seule comment animer un événement reçu.

---

## Snapshot public

```ts
api.getSnapshot()
// { state, activity, userPresence, environment, personality }
```

Read-only. Pas d’internals JARVIS.

---

## Lifecycle

1. Sophie `api.emit({ type: "pet" })`
2. Validation stricte
3. Mise à jour mémoire bornée (dernier signal / catégorie)
4. Dispatch bus (+ `user_interaction` si interaction)
5. Fusion optionnelle dans `ContextSnapshot.sophie`
6. Runtime peut lire le contexte au prochain tour — **pipeline normal**

Aucun chemin `Sophie → Executor`.

---

## Sécurité / non-contournement

- Pas de `execute()` / `shell()` / `performAction()` sur `SophieAPI`
- Signaux ≠ actions (music_started / user_idle / external_activity n’exécutent rien)
- Risk → Permission → Confirmation restent obligatoires pour toute action future
- Audits : `jarvis-integration-security-audit.ts`, `integration-contract-test.ts`

---

## Performances

Métriques : `eventDispatchMs`, `integrationMs`, `snapshotMs`.

Pas de polling, pas de scheduler, pas de retry infini.

---

## Limites

- Contrat de signaux uniquement (Phase 12)
- Pas de caméra / micro / SMS / shell / automation navigateur
- Mémoire Sophie bornée (pas de store infini)
- `NullSophieBridge` reste indépendant du dépôt Sophie

---

## Exemple

```ts
const integration = new SophieIntegration({ getRuntimeState: () => runtime.getState() });
const api = new SophieAPI(integration);

api.subscribe("behavior_started", (e) => {
  // Sophie choisit son animation
});

api.emit({ type: "pet" });
const snap = api.getSnapshot();
```
