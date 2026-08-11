# JARVIS — Ollama Production Reliability (Phase 22)

Version: **0.22.0**

## Principe

```text
OLLAMA PEUT ÉCHOUER.
JARVIS NE DOIT PAS DEVENIR INCORRECT À CAUSE DE CET ÉCHEC.
```

Le LLM interprète uniquement. Il n’autorise ni n’exécute.

## Architecture

### understand

```text
USER → Conversation → Ollama → retry policy → parse → schema → IntentValidator → DecisionEngine → …
```

### generateResponse

```text
RESULT FACTS → ResponsePolicy → Ollama → validation → fallback if needed → USER
```

Une panne de `generateResponse` après une action réussie utilise le **fallback déterministe** — elle ne transforme pas un succès d’action en échec.

## Error taxonomy

`LLMErrorCode` : UNAVAILABLE, CONNECTION_FAILED, TIMEOUT, HTTP_ERROR, MODEL_NOT_FOUND, EMPTY_RESPONSE, INVALID_JSON, INVALID_SCHEMA, RESPONSE_TOO_LARGE, INTERRUPTED, RATE_LIMITED, SERVER_ERROR, CIRCUIT_OPEN, UNKNOWN_ERROR.

Messages sanitized (pas de prompts/secrets/stack).

## Retry policy

- `maxAttempts = 2` (configurable, plafonné)
- Backoff borné : 100ms / 200ms (défaut)
- Retryable : timeout, connexion, 408/429/5xx
- Non-retryable : JSON/schema invalide, model not found, interrupted, circuit open

## Timeout policy

```text
understandTimeoutMs  (défaut 15000, env JARVIS_OLLAMA_UNDERSTAND_TIMEOUT_MS)
responseTimeoutMs    (défaut 12000, env JARVIS_OLLAMA_RESPONSE_TIMEOUT_MS)
JARVIS_OLLAMA_TIMEOUT_MS  (legacy, appliqué aux deux si spécifique absent)
```

## Cancellation

`AbortSignal` optionnel sur `LLMUnderstandRequest` / `LLMResponseGenerateRequest`.

Scope : **réseau/LLM uniquement**. N’annule jamais ActionExecutor ni une confirmation consommée.

## Circuit breaker

CLOSED → failures → OPEN → cooldown → HALF_OPEN → success → CLOSED.

Protection LLM uniquement. Quand OPEN : `LLM_CIRCUIT_OPEN` → fallback, pas de faux succès.

## JSON

`parseJsonCandidate` / `extractJsonObjectSafe` : conservateur — refuse texte brut, objets multiples, JSON ambigu. Pas de « réparation » inventant une intention.

## Status

`getRuntimeStatus()` : AVAILABLE | DEGRADED | UNAVAILABLE | UNKNOWN — on-demand, sans polling permanent.

## Observability / metrics

Compteurs bornés : requests, successes, failures, timeouts, retries, invalidJson, modelNotFound, …

Jamais : prompt complet, réponse complète, mémoire, secrets.

## Configuration

| Variable | Rôle |
|----------|------|
| `JARVIS_OLLAMA_URL` | endpoint (défaut loopback) |
| `JARVIS_OLLAMA_MODEL` | modèle |
| `JARVIS_OLLAMA_TIMEOUT_MS` | legacy timeout |
| `JARVIS_OLLAMA_UNDERSTAND_TIMEOUT_MS` | timeout understand |
| `JARVIS_OLLAMA_RESPONSE_TIMEOUT_MS` | timeout response |
| `JARVIS_LLM_PROVIDER=mock` | CLI mock |

## Tests

```bash
npx tsx tools/jarvis-ollama-reliability-preaudit.ts
npx tsx tools/jarvis-ollama-reliability-smoke.ts
npx tsx tools/jarvis-ollama-failure-matrix.ts
npx tsx tools/jarvis-ollama-reliability-simulation.ts
npx tsx tools/jarvis-ollama-live-audit.ts
npx tsx tools/jarvis-ollama-reliability-security-audit.ts
npx tsx tools/jarvis-ollama-reliability-privacy-audit.ts
```

## Limitations

- Circuit breaker local au process (pas partagé multi-instance)
- Pas d’annulation d’action déjà autorisée (volontaire)
- Live audit nécessite Ollama joignable ; sinon `STATUS: UNAVAILABLE`
