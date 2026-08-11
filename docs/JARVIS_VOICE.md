# JARVIS — Voice Interface (Phase 23)

Version: **0.23.0**

## Principe

```text
VOICE est une INTERFACE.
Pas une nouvelle autorité.
```

```text
VOICE → TEXT → CONVERSATION → UNDERSTAND → DECISION
  → POLICY → CONFIRMATION → EXECUTOR → RESPONSE → TTS
```

## Architecture

`src/voice/` :

- `VoiceService` — orchestre STT → `JarvisRuntime.processInput` → TTS
- `SpeechToTextProvider` / `TextToSpeechProvider` — abstractions
- `Mock*` / `Unavailable*` — tests et dégradation honnête
- `VoicePolicy` / `VoiceValidator` — hygiène transcript (≠ DecisionEngine)
- `VoiceAuditLog` / `VoiceMetrics` — metadata only

`VoiceService` n’importe **jamais** ActionExecutor, PermissionManager, ActionConfirmation.

## STT retenu (Phase 23)

| Provider | Rôle |
|----------|------|
| `MockSpeechToTextProvider` | Tests / push-to-talk simulé (pas de micro) |
| `UnavailableSpeechToTextProvider` | Défaut honnête si aucun moteur réel |

**Locale réelle (SFSpeechRecognizer)** : future bridge natif — **non livré** en 0.23.0.  
**API réseau** : non requise.

## TTS retenu (Phase 23)

| Provider | Rôle |
|----------|------|
| `MockTextToSpeechProvider` | Présentation synthétique (pas d’audio OS) |
| `UnavailableTextToSpeechProvider` | Fallback texte |

**AVSpeechSynthesizer** : future — non livré. JARVIS reste utilisable **sans TTS**.

## Permissions

- Mock : aucune
- STT réel futur : Microphone TCC macOS
- Si non autorisé : `VOICE_PERMISSION_REQUIRED` (jamais de faux « j’écoute »)

## Confirmation

Identique Phase 8 : le transcript `"oui"` passe par `processInput` → `ActionConfirmation` token.  
Confiance STT ≠ autorisation. Low confidence → clarification, **aucun** `processInput`.

## Privacy

- Pas d’enregistrement permanent
- Pas de stockage audio par défaut
- Audit : `transcriptChars` + `confidenceBucket` — pas le texte complet
- Voice ≠ Memory auto-promotion

## Interruptions

`interruptSpeech()` arrête la **présentation** TTS uniquement.  
N’annule jamais une action déjà autorisée / exécutée.

VoiceState séparé du FSM Runtime : IDLE / LISTENING / TRANSCRIBING / PROCESSING / SPEAKING / ERROR.

## Wake word

Non implémenté. Phase 23 = **push-to-talk / explicit listen** uniquement.

## Tests

```bash
npx tsx tools/jarvis-voice-preaudit.ts
npx tsx tools/jarvis-voice-smoke.ts
npx tsx tools/jarvis-voice-audit.ts
npx tsx tools/jarvis-voice-privacy-audit.ts
npx tsx tools/jarvis-voice-simulation.ts
```

## Limitations

- Pas de micro/TTS OS natif dans 0.23.0
- Latence micro réelle : **indisponible** (Mock seulement)
- Wake word : Phase future
