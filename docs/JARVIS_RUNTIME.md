# JARVIS Interactive Runtime — Phase 10

> Le LLM comprend. Le Runtime orchestre. Le Planner planifie. La sécurité décide. La confirmation autorise. L'Executor agit. JARVIS répond.

```
                 USER
                  │
                  ▼
             JarvisRuntime
                  │
                  ▼
             IntentRouter
                  │
                  ▼
              LLMProvider
                  │
                  ▼
           IntentValidator
                  │
                  ▼
            ActionPlanner
                  │
          ┌───────┴───────┐
          ▼               ▼
       Risk/Policy     Conversation
          │
          ▼
      Permission
          │
          ▼
     Confirmation
          │
          ▼
     ActionExecutor
          │
          ▼
        Result
          │
          ▼
   ResponseFormatter
          │
          ▼
         USER
```

---

## Runtime

`JarvisRuntime.processInput(text)` orchestrates existing services only.

States: `IDLE` → `UNDERSTANDING` → `PLANNING` → `WAITING_CONFIRMATION` → `EXECUTING` → `COMPLETED` / `ERROR`

No direct `node:fs`, shell, or native system APIs in the runtime.

---

## Conversation context

`ConversationContext` keeps only short-lived pending confirmation:

- taskId
- Phase 8 confirmation token (actionType + payloadHash + expiry)
- plan metadata

`"oui"` is **never** a global authorization. It only applies to the pending bound token.

New command while waiting → previous pending is cancelled/invalidated.

---

## Response model

| type | meaning |
|------|---------|
| `message` | conversation / info |
| `clarification` | ambiguous request |
| `confirmation_required` | wait for oui/non |
| `executed` | Phase 8 execute succeeded |
| `cancelled` | user said non |
| `error` | unavailable / denied / expired / etc. |

---

## CLI

```bash
npm run jarvis
npm run jarvis -- --health
npm run jarvis -- --timing
```

Production uses **Ollama** by default. If unavailable → explicit error (no silent Mock).

Tests/dev Mock: `JARVIS_LLM_PROVIDER=mock`

Optional file allow paths: `JARVIS_FILE_ALLOW_PATHS=/path1,/path2`

---

## Ollama health

`probeLLMHealth()` / `npm run jarvis -- --health`

Reports real status, model, latency — never invented.

---

## Fallback

Without Ollama: `LLM_UNAVAILABLE` response. Mock only when explicitly configured.

---

## Security

- All mutations via ActionService (Phase 8)
- Confirmation tokens remain single-use / bound / expiring
- Injection / shell-like text does not execute
- Runtime audit: metadata only (no secrets / file contents)

---

## Limitations

- No long-term memory
- No new system actions in Phase 10
- No camera / mic / browser automation / shell
- File actions need allow-paths configured for real use
