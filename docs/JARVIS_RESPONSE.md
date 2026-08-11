# JARVIS — Natural Response Intelligence (Phase 19)

Version: **0.19.0**

## Principe

```text
LLM INTERPRETS
DECISION ENGINE EVALUATES
POLICY AUTHORIZES
EXECUTOR ACTS
RESPONSE GENERATOR EXPLAINS
```

Le générateur produit uniquement un `ResponseDraft`. Il n’exécute rien.

## Architecture

```text
RESULT (action/context/memory/…)
  → ResponsePolicy (catégorie imposée)
  → LLMProvider.generateResponse? (formulation)
  → ResponseValidator
  → fallback déterministe si besoin
  → utilisateur
```

## ResponseDraft

`text`, `tone`, `source`, `confidence`, `facts`, `warnings`, `category`, `usedLlm`

Les `facts` viennent uniquement de JARVIS — jamais inventés.

## LLM

`understand()` et `generateResponse()` sont séparés.

Mock : formulation déterministe.  
Ollama : prompt FR strict (faits seulement).  
Indisponible → fallback, jamais de faux succès.

## Policy / Validator

Catégories imposées par le runtime (`ACTION_SUCCESS`, `CLARIFICATION`, …).  
Le validator refuse instructions exécutables, claims de permission/confirmation, actions inventées — tout en permettant de *discuter* des commandes.

## Privacy

Audit : `responseId`, category, source, confidence, latency, factKeys — pas le message utilisateur.

## Tests

```bash
npx tsx tools/jarvis-response-preaudit.ts
npx tsx tools/jarvis-response-smoke.ts
npx tsx tools/jarvis-response-audit.ts
npx tsx tools/jarvis-response-security-audit.ts
npx tsx tools/jarvis-response-simulation.ts
```

## Limitations

- Formulation LLM optionnelle ; fallback toujours présent
- Pas toutes les branches runtime ne passent encore par `naturalize` (chemins principaux couverts)
- Double understand action path corrigé en Phase 20 (`planFromOutcome`)
