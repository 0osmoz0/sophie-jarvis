# JARVIS — Production Hardening & Observability (Phase 21)

Version: **0.21.0**

## Principe

```text
LLM INTERPRETS
→ CONVERSATION PROVIDES CONTEXT
→ DECISION EVALUATES
→ POLICY / PERMISSION AUTHORIZE
→ EXECUTOR ACTS
→ RESPONSE EXPLAINS
→ OBSERVABILITY OBSERVES (passive)
```

```text
OBSERVE ≠ DECIDE
DECIDE ≠ AUTHORIZE
AUTHORIZE ≠ EXECUTE
EXECUTE ≠ RESPOND
```

## Module `src/observability/`

- `PipelineTrace` / `PipelineTraceCollector` — stages metadata par `requestId`
- `PipelineMetrics` — compteurs bornés + latences mesurées
- `JarvisError` — taxonomie d’erreurs user-safe
- `ObservabilityPolicy` — refuse secrets / contenus sensibles dans les détails
- `ObservabilityAuditLog` — journal borné (metadata only)

Jamais d’autorité : pas d’import Executor / Permission / shell / réseau.

## CLI

```bash
npm run jarvis -- --timing
npm run jarvis -- --trace
npm run jarvis -- --metrics
```

La trace n’affiche pas prompts, mémoire, secrets, ni contenus de fichiers.

## Fiabilité runtime

- Garde concurrente : un seul `processInput` in-flight ; second → `CONCURRENT_REQUEST`
- Récupération : `UNDERSTANDING` / `PLANNING` / `EXECUTING` → `IDLE` si abandon
- Confirmation : token single-use (Phase 8) ; `oui` après restart ne peut pas exécuter
- Audit runtime borné (1000 entrées)

## Restart

| Survivit | Disparaît |
|----------|-----------|
| Mémoire persistante configurée | Pending confirmation |
| | Tokens ActionConfirmation |
| | État EXECUTING / UNDERSTANDING |
| | Traces in-flight / requestId actif |

## Tests

```bash
npx tsx tools/jarvis-production-preaudit.ts
npx tsx tools/jarvis-observability-security-audit.ts
npx tsx tools/jarvis-observability-privacy-audit.ts
npx tsx tools/jarvis-failure-matrix.ts
npx tsx tools/jarvis-chaos-simulation.ts
npx tsx tools/jarvis-long-session-simulation.ts
```

Chaos / long-session : **MODE: SIMULATION** — ne pas confondre avec incidents réels.
