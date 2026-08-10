# JARVIS Controlled Action Execution — Phase 8

JARVIS never executes arbitrary shell commands.

```
Intent → Plan → Risk → Permission → Confirmation → Execute → Result → Audit
```

Pipeline:

```
Intent → JarvisCore → PermissionManager → ActionTool
  → ActionPermissionPolicy → ActionService → ActionExecutor
  → FileService | ApplicationService
```

---

## ActionType

Typed actions only (no generic “run command”):

| ActionType | Risk | Service |
|------------|------|---------|
| `FILE_COPY` | MEDIUM | FileService.copy |
| `FILE_MOVE` | MEDIUM | FileService.move |
| `FILE_CREATE` | MEDIUM | FileService.create |
| `FILE_DELETE` | HIGH | FileService.delete |
| `APP_OPEN` | MEDIUM | ApplicationService.open |
| `APP_CLOSE` | MEDIUM | ApplicationService.close |

Each action has a **typed payload**. Payloads cannot carry `command`, `shell`, `args`, `argv`, `eval`, `code`, etc.

---

## ActionPlan

```ts
{
  taskId, actionType, payload, riskLevel,
  requiresConfirmation, status, createdAt
}
```

Statuses:

`PLANNED` → `CONFIRMATION_REQUIRED` → `APPROVED` → `EXECUTING` → `COMPLETED`

Branches: `DENIED` | `FAILED` | `CANCELLED`

Never `PLANNED → EXECUTING` when confirmation is required.

---

## Registry

`ActionRegistry` is code-defined. Actions are not registered from free-form user text.

Each definition: actionType, riskLevel, confirmation requirement, payload validator, audit label.

---

## Risk model

- **LOW** — read / non-mutating (tools like `action.plan`, `action.cancel`)
- **MEDIUM** — limited mutation + confirmation
- **HIGH** — destructive potential + reinforced confirmation
- **CRITICAL** — always **DENIED**

Unknown action types → DENIED.

---

## Confirmation

`ActionConfirmation` tokens bind:

- `taskId`
- `actionType`
- `payloadHash`
- `expiresAt`

A confirmation for FILE_DELETE A cannot authorize FILE_DELETE B or APP_CLOSE.

Human-readable request example:

> JARVIS veut déplacer :  
> /sandbox/a.txt  
> vers :  
> /sandbox/archive/a.txt  
> Confirmer ?

Never: “Voulez-vous exécuter cette commande ?”

---

## Execution

`ActionExecutor` only calls existing services. No direct `node:fs`, no native macOS APIs, no shell.

---

## Dry-run

Plans can be evaluated with `dryRun: true` to describe effects without mutation.

---

## Idempotence

A `taskId` in `COMPLETED` cannot be executed again → `ALREADY_COMPLETED`.

---

## Cancellation

`cancel(taskId)` only before `EXECUTING`. After that → `CANCEL_UNAVAILABLE`. No brutal interrupt of in-flight system work.

---

## Timeout

Configurable execution timeout. On exceed → `FAILED` / `TIMEOUT`. No automatic retry of destructive actions.

---

## Rollback

Conceptual `ActionRollback`:

| Action | Rollback |
|--------|----------|
| FILE_COPY | Optional delete of destination **if** tracked and safe |
| FILE_MOVE | UNAVAILABLE (not automated) |
| FILE_DELETE | UNSUPPORTED |
| APP_OPEN | UNAVAILABLE (no auto-close) |
| APP_CLOSE | UNSUPPORTED (no auto-reopen) |

---

## Tools

| Tool | Risk |
|------|------|
| `action.plan` | LOW |
| `action.confirm` | MEDIUM |
| `action.execute` | HIGH |
| `action.cancel` | LOW |

All mutations go through `ActionService`. PermissionManager is never bypassed.

---

## Audit

Logs: timestamp, taskId, actionType, riskLevel, confirmationState, status, resultCode.

Never: secrets, file contents, passwords, screenshots, arbitrary commands.

---

## Security model

Primary controls:

1. Typed `ActionType` + registry  
2. Typed payload validators  
3. Risk + PermissionManager  
4. Bound, expiring confirmation tokens  
5. Executor limited to FileService / ApplicationService  

Secondary heuristics reject shell-like characters in payload strings — not relied on alone.

**Forbidden:** `execute(command)`, `child_process`, `exec`/`spawn`/`fork`, `osascript`, `eval`, arbitrary native invocation.
