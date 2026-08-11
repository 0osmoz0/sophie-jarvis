# JARVIS — Sophie Environmental Consumer (Phase 26)

Version: **0.26.0**

## Principe

```text
EnvironmentContext is observational data.

It is not authorization.
It is not a command.
It is not a behavior decision.
It is not a memory.
It is not proof of user intent.
```

Architecture :

```text
macOS / Native
  → EnvironmentContext
  → EnvironmentChangeTracker
  → SophieEnvironmentConsumer
  → SophieEnvironmentSnapshot
  → Future Behavior Layer (NOT Phase 26)
```

## Sophie position anchor

**Dans ce dépôt :** aucune position globale Sophie fiable
(`SophiePublicSnapshot` n’a pas de géométrie ; pas de perch/physics/NSPanel).

```text
available = false
x = null
y = null
```

Injection optionnelle pour tests / runtime Sophie externe :

`StaticSophieAnchorProvider` — **une seule source de vérité** injectée, pas un second système inventé.

Espace attendu si ancré : `cocoa-global-bottom-left` (même espace que le curseur).

## Cursor ↔ Sophie

`computeSophieCursorRelation` uniquement si **les deux** ancres sont fiables.

Sinon : `distance / near / approaching / leaving = null` (jamais `false` inventé).

## Signaux

`SophieEnvironmentSignals` — observations booléennes / niveaux.

Ne déclenchent **aucune** animation.

## Surface / void

**MISSING** dans jarvis → `onValidSurface = null`, `inVoid = null`.

## Audio

Phase 25 inchangée : **UNAVAILABLE**. Spotify ouvert ≠ playing.

## API unique

```ts
await contextService.getSophieEnvironmentSnapshot()
// ou
await consumer.getSophieEnvironmentSnapshot(contextService)
```

## Interdits Phase 26

- BehaviorBrain / BehaviorScheduler / quotas
- setInterval / polling permanent
- ActionExecutor / DecisionEngine / Memory mutations
- réactions `cursorNear → animation`

## Tests

```bash
npx tsx tools/jarvis-sophie-environment-preaudit.ts
npx tsx tools/jarvis-sophie-environment-smoke.ts
npx tsx tools/jarvis-sophie-environment-simulation.ts
```
