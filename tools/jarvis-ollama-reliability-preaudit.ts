/**
 * Phase 22 — Ollama reliability PRE-AUDIT (read-only inventory).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const report = [
    "=== JARVIS OLLAMA RELIABILITY PRE-AUDIT — PHASE 22 ===",
    "",
    "INVENTORY (before hardening)",
    "----------------------------",
    "| Cas | Existe? | Comportement actuel | Risque | Correction Phase 22 |",
    "|-----|---------|---------------------|--------|---------------------|",
    "| Ollama indisponible | Oui | UNAVAILABLE | Honest | LLM_UNAVAILABLE + circuit |",
    "| connexion refusée | Oui | UNAVAILABLE | Retryable missed | LLM_CONNECTION_FAILED + retry |",
    "| timeout | Oui | TIMEOUT via AbortController | Same timeout both ops | Separate timeouts + retry |",
    "| HTTP non-2xx | Partiel | ERROR/UNAVAILABLE 404 | 429/5xx not retried | classifyHttpStatus + retry |",
    "| réponse vide | Oui | INVALID_RESPONSE | OK | LLM_EMPTY_RESPONSE |",
    "| JSON invalide | Oui | INVALID_RESPONSE | Aggressive extractJson | Conservative parseJsonCandidate |",
    "| JSON partiel | Partiel | may parse wrong | False intent | reject ambiguous |",
    "| mauvais schema | Via IntentValidator | rejected | OK | LLM_INVALID_SCHEMA early |",
    "| modèle absent | Partiel | 404→UNAVAILABLE | Opaque | LLM_MODEL_NOT_FOUND |",
    "| modèle non chargé | Partiel | same | Opaque | same |",
    "| erreur serveur Ollama | Partiel | ERROR | No retry | LLM_SERVER_ERROR retryable |",
    "| réponse trop longue | Oui | INVALID_RESPONSE | OK | LLM_RESPONSE_TOO_LARGE |",
    "| réponse lente | Timeout only | TIMEOUT | Shared timeout | responseTimeoutMs |",
    "| réponse interrompue | AbortError=TIMEOUT | Confuses cancel | LLM_INTERRUPTED |",
    "| erreur réseau temporaire | As UNAVAILABLE | No retry | Retry policy |",
    "| erreur permanente | Mixed | — | Non-retryable codes |",
    "| champs interdits | IntentValidator | reject | OK | Keep Phase 8/9 |",
    "| prompt injection | Validator+prompt | reject | OK | Regression tests |",
    "| erreur generateResponse | Returns failure | ResponseGenerator fallback | OK | Separate metrics |",
    "",
    "GAPS",
    "----",
    "- No centralized LLMErrorCode taxonomy",
    "- No controlled retry / backoff",
    "- No circuit breaker",
    "- No separate understand/response timeouts",
    "- No bounded LLM metrics",
    "- External AbortSignal not accepted on requests",
    "",
    "PRE-AUDIT STATUS: COMPLETE (read-only)",
  ].join("\n");

  console.log(report);
  const out = path.join(
    ROOT,
    "tools/.audit-cache/jarvis-ollama-reliability-phase22-preaudit.txt",
  );
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, report + "\n", "utf8");
  console.log(`\nWrote ${path.relative(ROOT, out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
