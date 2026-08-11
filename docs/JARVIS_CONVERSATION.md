# JARVIS — Conversational Intelligence (Phase 17)

Version: **0.17.0**

## Principe

```text
CONVERSATION ≠ MEMORY
MEMORY ≠ PERMISSION
CONTEXT ≠ AUTHORIZATION
LLM ≠ EXECUTOR
```

Pipeline:

```text
User text
 → ReferenceResolver (info only)
 → IntentRouter / LLM
 → IntentValidator
 → ActionPlanner
 → Risk / Permission / Confirmation
 → Executor
```

## ConversationMessage

Tour borné local (`id`, `role`, `content`, `timestamp`, `metadata?`).
Les métadonnées d’audit portent `intentType` / `status` — **pas** le contenu dans les logs runtime.

## ConversationStore

`InMemoryConversationStore` : `append`, `getRecent`, `get`, `clear`, `count`.
Borné (`maxMessages`, défaut 200), local, effaçable.
**Indépendant** de `MemoryStore`.

## Context Window

`ConversationWindow` sélectionne un sous-ensemble :

- `maxMessages` (12)
- `maxCharacters` (3000)
- `maxTokens` (~750, approx chars/4)

Jamais toute la conversation n’est envoyée au LLM.

## Summaries

`ConversationSummarizer` compresse les tours anciens au-delà d’un seuil.
Conserve objectifs / décisions / sujets / entités.
**Ne devient jamais** automatiquement de la mémoire long terme.

## ReferenceResolver

Résout : `le`, `ferme-le`, `ce fichier`, `cette application`, `l'autre`, etc.

- 1 candidat → `resolved`
- plusieurs → `ambiguous` → clarification obligatoire
- 0 → `unresolved` → clarification

Une référence résolue est une **information**, jamais une autorisation.

## EntityTracker

Registre conversationnel borné (`recentEntities`) : applications, fichiers, projets, etc.
Jamais promu automatiquement en mémoire permanente.

## Intégration mémoire (Phase 16)

Priorité :

1. Message utilisateur explicite
2. Référence conversationnelle
3. Environnement courant (Phase 11)
4. Mémoire long terme pertinente
5. Inférence LLM générale

La mémoire **n’écrase pas** une référence conversationnelle explicite.

## Environnement

Utilisé seulement si pertinent (`ferme l'application ouverte`, etc.).
Si plusieurs apps → clarification. Jamais d’invention.

## Clarification & corrections

- `needs_clarification` si ambigu / non résolu
- `non, Safari` = correction (nouvelle demande), pas de réécriture de l’historique d’exécution
- Si l’action est déjà `EXECUTED`, la correction est une **nouvelle** intention

## Confirmation (Phase 8)

Les follow-ups `oui` / `non` / `fais-le` / `annule` restent liés à :

```text
taskId + actionType + payloadHash + expiry
```

Le contexte conversationnel **ne remplace jamais** le token de confirmation.
« Tu as déjà confirmé » ≠ confirmation réelle.

## Contrat LLM

Entrée structurée (DATA) :

```json
{
  "conversation": [...],
  "references": [...],
  "memory": [...],
  "environment": {}
}
```

Sortie validée : `{ type, payload }` (ou contrat Phase 17 normalisé).
Rejet de : `execute`, `shell`, `command`, `permissionGranted`, `confirmationGranted`.

L’historique conversationnel est traité comme **DATA**, jamais comme instruction système.

## Privacy

Audit runtime : `messageId`, `role`, `intent`, `latency`, `status` — **pas** `message.content`.
Pas de persistance automatique de mots de passe, tokens, clipboard, screenshots.

## Performance

Mesures réelles via smoke / simulation (`conversationAppendMs`, `windowBuildMs`, `referenceResolveMs`, …).
Fenêtre bornée pour éviter la croissance linéaire du prompt LLM.
Aucun SLA fictif annoncé.

## Limitations

- Résolution d’anaphore heuristique (pas NLU complet)
- Résumé extractif simple (pas de LLM summarizer dédié)
- Double appel understand+plan sur le chemin action (héritage Phase 10)
- Pas de slot-filling multi-tours générique hors références / confirmation
- Pas de nouvelles actions système dans cette phase

## Tests

```bash
npx tsx tools/jarvis-conversation-smoke.ts
npx tsx tools/jarvis-conversation-audit.ts
npx tsx tools/jarvis-conversation-security-audit.ts
npx tsx tools/jarvis-conversation-simulation.ts
```
