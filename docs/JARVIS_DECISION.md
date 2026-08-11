# JARVIS — Decision & Reasoning Engine (Phase 18)

Version: **0.18.0**

## Principe

```text
LLM INTERPRETS
MEMORY INFORMS
CONTEXT INFORMS
DECISION ENGINE EVALUATES
POLICY AUTHORIZES
CONFIRMATION AUTHORIZES THE USER
EXECUTOR ACTS
SOPHIE PRESENTS
```

Le DecisionEngine **n’autorise jamais** et **n’exécute jamais**.

## Pipeline

```text
USER → CONVERSATION → MEMORY → ENVIRONMENT → LLM
  → DECISION ENGINE → DECISION
  → RISK / PERMISSION → CONFIRMATION → EXECUTION → RESPONSE
```

## Decision

Types: `ANSWER` | `ACTION` | `CLARIFICATION` | `REFUSAL` | `NO_ACTION` | `DEFER` | `INFORMATION_REQUIRED`

Champs clés: `confidence`, `evidence`, `missingInformation`, `requiresClarification`, `requiresConfirmation`, `origin` (`USER_REQUESTED` | `CONTEXT_SUGGESTED`).

## Priorité

1. message utilisateur explicite  
2. correction utilisateur  
3. référence conversationnelle  
4. environnement  
5. mémoire  
6. inférence LLM  

## Gating ACTION

Une `ACTION` exige: intent valide, payload complet, confiance ≥ seuil, origin USER_REQUESTED, pas d’ambiguïté.
Sinon → `CLARIFICATION` / `INFORMATION_REQUIRED` / `REFUSAL`.

`CONTEXT_SUGGESTED` ne devient **jamais** une action.

## ContradictionDetector

Détecte corrections (`non, Chrome`), mémoire vs explicite (explicite gagne), annulation de fermeture.

## Explanation

`DecisionExplanation` produit WHY / EVIDENCE / MISSING / NEXT STEP — sans prompts, tokens, secrets.

## Privacy

Audit: `decisionId`, type, confidence, risk, source categories, latency — **pas** le contenu des messages.

## Tests

```bash
npx tsx tools/jarvis-decision-preaudit.ts
npx tsx tools/jarvis-decision-smoke.ts
npx tsx tools/jarvis-decision-audit.ts
npx tsx tools/jarvis-decision-security-audit.ts
npx tsx tools/jarvis-decision-simulation.ts
```

## Limitations

- Pas de nouvel événement Sophie typé (évite churn contrat) — décisions auditées côté JARVIS
- Double understand action path toujours présent (héritage Phase 10)
- Heuristiques de contradiction / confiance (pas un modèle de raisonnement LLM)
