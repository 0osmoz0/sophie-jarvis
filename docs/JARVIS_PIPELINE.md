# JARVIS — Pipeline Consolidation & Low-Latency (Phase 20)

Version: **0.20.0**

## Objectif

Consolider le pipeline existant : une compréhension, une décision, un chemin de résultat, une réponse — avec mesures réelles de latence. Pas de nouvelles capacités système.

## Architecture

```text
USER
 ↓
Conversation.prepareTurn
 ↓
UNDERSTAND ×1  →  ValidatedIntent / IntentRouterOutcome
 ↓
DecisionEngine.evaluate ×1
 ↓
Action / Context / Memory (selon décision)
 ↓
Result
 ↓
ResponseGenerator ×1  (+ fallback si LLM indisponible / rejeté)
 ↓
USER
```

## Single-pass understanding

Problème historique : `planFromText()` rappelait `understand()`.

Correctif Phase 20 :

- `IntentRouter.planFromOutcome(outcome)` — planifie **sans** LLM
- `JarvisRuntime` réutilise l’outcome déjà validé

```text
ONE REQUEST → ONE UNDERSTAND → ONE DECISION → ONE RESPONSE
```

## RequestPipelineContext

Objet d’orchestration interne (`src/runtime/RequestPipelineContext.ts`) :

- transporte résultats (intent, decision, plan, timings, draft)
- **aucune autorité** supplémentaire
- ne crée jamais de raccourci LLM → Executor / Response → Permission

## Timing

`PipelineTiming` mesure réellement :

conversation, références, mémoire, understand, validation, decision, planning, confirmation, execution, context, response, total.

CLI :

```bash
npm run jarvis -- --timing
```

Classification diagnostique uniquement :

| Classe | Seuil |
|--------|-------|
| FAST | < 100 ms |
| NORMAL | 100–500 ms |
| SLOW | 500–1500 ms |
| VERY_SLOW | > 1500 ms |

## Context optimization

`ContextService.getSnapshot(query)` ne sollicite que les domaines pertinents (`system.status`, `application.status`, …). Pas de nouveau moteur de règles.

## Memory optimization

`ConversationService.prepareTurn` ne rappelle la mémoire que si `looksLikeMemoryQuestion`. Compteurs : `memoryRecallUsed` / `memoryRecallSkipped`.

## Conversation

Fenêtre bornée (défaut : 12 messages / 3000 caractères). Le store est plafonné séparément. Le contexte LLM ne croît pas sans limite.

## Fallback réponse

Une seule `generateResponse` par narration. Fallback si LLM indisponible ou réponse rejetée par `ResponseValidator`.

## Erreurs

Les erreurs (permission, échec action, timeout, LLM unavailable, …) doivent remonter jusqu’à l’utilisateur via ResponseGenerator — jamais transformées en faux succès.

## Interruption / cancellation

Comportement actuel (pas de cancellation complexe ajoutée) :

- Une nouvelle commande pendant `WAITING_CONFIRMATION` peut annuler via « non » ou remplacer le pending (chemins existants)
- Pas d’annulation arbitraire d’une action **déjà** autorisée / en cours d’exécution
- Les appels LLM en cours ne sont pas abortés par un nouveau tour (risque documenté ; future amélioration possible)

## Security boundaries

```text
LLM            → INTERPRETATION
DecisionEngine → EVALUATION
Policy/Confirm → AUTHORIZATION
Executor       → ACTION
Response       → EXPLANATION
```

Interdits : LLM → Executor, Response → Permission, Conversation/Memory/Context → Authorization.

## Privacy

Les audits timing / perf n’enregistrent pas prompts complets, mémoire complète, ni secrets — métadonnées et latences uniquement.

## Ollama

Mesures via `tools/jarvis-llm-performance-audit.ts`. Si absent : `STATUS: UNAVAILABLE` (aucun chiffre fictif).

## Known bottlenecks

- Avec Mock : overhead runtime (ms)
- Avec Ollama : `understand` + `generateResponse` dominent (souvent secondes)
- Confirmations utilisateur restent interactives (latence humaine hors pipeline)

## Tests

```bash
npx tsx tools/jarvis-pipeline-preaudit.ts
npx tsx tools/jarvis-pipeline-audit.ts
npx tsx tools/jarvis-pipeline-security-audit.ts
npx tsx tools/jarvis-pipeline-simulation.ts
npx tsx tools/jarvis-llm-performance-audit.ts
JARVIS_LLM_PROVIDER=mock npx tsx tools/jarvis-interaction-benchmark.ts
```

Ne pas confondre `MODE: SIMULATION` (mock) et mesures Ollama / runtime réel.
