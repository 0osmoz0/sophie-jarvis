## Phase 1 → Phase 23

- **Phase 1–22** : Core → … → Ollama Reliability
- **Phase 23** : Voice Interface (`0.23.0`) — COMPLETE

Voir `docs/JARVIS_VOICE.md` (et `docs/JARVIS_OLLAMA_RELIABILITY.md` pour la Phase 22).

## Démarrage rapide

```bash
npm install
npm run build:native   # optionnel, darwin + Xcode
npm run jarvis
JARVIS_LLM_PROVIDER=mock npm run jarvis
```

La voix est **optionnelle** (Mock STT/TTS pour tests). Sans micro/TTS natif, le CLI texte reste le chemin principal.

## Validation

```bash
npx tsc --noEmit
npm run preaudit:voice
npm run smoke:voice
npm run audit:voice
npm run audit:voice-privacy
npm run sim:voice
```
