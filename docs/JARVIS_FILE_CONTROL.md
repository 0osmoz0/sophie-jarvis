# JARVIS File Control — Phase 3

JARVIS now has constrained “hands” for files — **only** inside explicitly allowed paths.

```
Intent
  ↓
JarvisCore
  ↓
PermissionManager
  ↓
FileTool
  ↓
FilesystemPolicy (FilePolicy + FilePathResolver)
  ↓
FileService  ← sole mutating fs owner
  ↓
Result
```

No other path to the filesystem is allowed. A future LLM must never call Node `fs` directly. Sophie must never call `FileService` directly.

---

## Allowed paths

Default: **none** (`[]`).

Configure explicitly:

```ts
fileService.setAllowedPaths(["/absolute/path/to/JarvisSandbox"]);
// tests use: tools/.tmp/jarvis-files/sandbox
```

Never auto-allow:

`/`, `~/Library`, `/System`, `/Library`, `/etc`, `/private`, `/var`, `~/.ssh`, `~/.aws`, `~/.config`

These stay **hard-blocked** even if mistakenly listed as allowed.

Symlinks are resolved (`realpath`); escape outside the sandbox → **DENIED**.

---

## Tools & RiskLevels

| Tool | Risk | Confirmation |
|------|------|--------------|
| `file.list` | LOW | No |
| `file.info` | LOW | No |
| `file.copy` | MEDIUM | Yes |
| `file.move` | MEDIUM | Yes |
| `file.create` | MEDIUM | Yes |
| `file.delete` | HIGH | Yes (explicit) |

CRITICAL is not used for these tools.

---

## Operations

### file.list
Metadata only (`name`, `type`, `size`, `modifiedAt`). No file contents. Non-recursive by default (`recursive: false`). Max recursion depth capped.

### file.info
Metadata only — never reads contents.

### file.copy / file.move
Both source **and** destination must be allowed. No silent overwrite (`overwrite: true` required to replace). Files only in Phase 3.

### file.create
Simple text only (`.txt` `.md` `.csv` `.json` `.log` or no extension). Blocks scripts/executables/shebangs/launch agents. Atomic write via temp + rename inside the sandbox.

### file.delete
**Files only** — never directories, never recursive, never force-rm of trees.

---

## Confirmations

Uses the existing PermissionManager / TaskManager flow:

```
Tool request → require_confirmation → waiting_confirmation
→ confirmTask(taskId) → execute
```

A confirmation is bound to **one** task (tool id + arguments + task id + timestamp). There is no “always allow file.delete”.

---

## Dry run

```ts
fileService.plan("move", { source, destination });
// or
fileService.copy({ source, destination, dryRun: true });
```

Returns:

```ts
{
  operation, source, destination,
  riskLevel, requiresConfirmation, summary
}
```

No mutation during dry run.

---

## Path traversal & symlink protection

Always: normalize → expand `~` → decode one URI layer → `path.resolve` → policy check → prefer `realpath`.

Denied examples: `../`, `../../`, absolute paths outside sandbox, URL-encoded `..`, symlink to `/etc/...`.

---

## Audit log

In-memory (`MemoryFileAuditLog`): timestamp, taskId, toolId, operation, source, destination, riskLevel, confirmation, result.

**Never** stores file contents. Sink interface allows a secure store later.

---

## Examples (structured intents)

**Liste mon dossier** (LOW — immédiat si path autorisé) :

```json
{ "tool": "file.list", "arguments": { "path": "/…/JarvisSandbox" } }
```

**Copie ce fichier** (MEDIUM — confirmation) :

```json
{
  "tool": "file.copy",
  "arguments": {
    "source": "/…/JarvisSandbox/a.txt",
    "destination": "/…/JarvisSandbox/archive/a.txt"
  }
}
```

**Déplace / crée / supprime** : same pattern with `file.move`, `file.create`, `file.delete` — MEDIUM/HIGH require `confirmTask` after `waiting_confirmation`.

---

## Limitations (Phase 3)

- No arbitrary filesystem access
- No directory delete / recursive delete
- No binary/script creation
- No shell / AppleScript / network / camera / microphone
- Sophie not wired to files
- Test sandbox only under `tools/.tmp/jarvis-files/` — never personal Downloads/Desktop

---

## Safety confirmation

Phase 3 adds **controlled file actions** inside a sandbox with policy, risk levels, confirmation, dry-run, audit, and path/symlink guards.

**Do not start Phase 4** without human validation.
