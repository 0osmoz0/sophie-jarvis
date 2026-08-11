# JARVIS Long-Term Memory — Phase 16

> JARVIS REMEMBERS · JARVIS DOES NOT ASSUME · JARVIS DOES NOT EXECUTE FROM MEMORY  
> MEMORY INFORMS · MEMORY NEVER DECIDES · MEMORY NEVER EXECUTES

```text
USER
 ↓
LLM / Explicit command
 ↓
MemoryCandidate
 ↓
Validator
 ↓
Policy
 ↓
MemoryService
 ↓
MemoryStore (+ optional JSON persistence)
 ↓
Context / Runtime (relevant only)
```

## Architecture

| Module | Rôle |
|--------|------|
| `MemoryRecord` | Souvenir typé |
| `MemoryValidator` | Schéma + secrets + commandes |
| `MemoryPolicy` | STORE / REJECT / TEMPORARY |
| `MemoryService` | remember / recall / forget / search |
| `InMemoryMemoryStore` | Store borné (défaut 500) |
| `JsonMemoryPersistence` | Persistance locale optionnelle |
| `MemoryAuditLog` | Audit sans contenu |

## Memory kinds

`fact` · `preference` · `goal` · `project` · `decision` · `constraint` · `relationship` · `temporary`

## Policy

- Préférences / projets / objectifs explicites → STORE  
- Activité transitoire / faible confiance / langage hésitant → TEMPORARY (+ expiration)  
- Secrets, commandes, jailbreaks → REJECT  

## Privacy

Ne stocke **jamais** : passwords, API keys, tokens, private keys, cartes, screenshots, clipboard, frappe, caméra, micro.

## Retrieval

`recallRelevant(query)` avec budget (`maxMemories`, `maxCharacters`).  
Ne jamais injecter toute la mémoire dans chaque prompt.

## Conflicts & dedup

- Doublons fusionnés (similarité + topic)  
- Préférence explicite plus récente **supersede** l'ancienne  

## Security

La mémoire peut **informer** la baseline (apps habituelles).  
Elle ne peut **jamais** bypasser policy / permission / confirmation / denylist.

## Tools / intents

```text
memory.recall / search / list  → LOW
memory.remember / forget       → MEDIUM (forget confirme oui/non)
```

## Persistence

Fichier local `.jarvis/memory.json` (gitignored).  
Désactiver : `JARVIS_MEMORY_PERSIST=0`.  
Chemin custom : `JARVIS_MEMORY_PATH=...`.  
Pas de SQLite, pas de réseau.

## Limitations

- Pas de mémoire conversationnelle multi-tours complète  
- Extraction LLM = candidats seulement (jamais écriture directe)  
- Confiance imparfaite sur le langage naturel  
- Pas de synchronisation cloud  

## WHAT MEMORY CANNOT DO

- Exécuter des actions  
- Contourner la sécurité  
- Stocker des secrets  
- Remplacer le jugement humain  
