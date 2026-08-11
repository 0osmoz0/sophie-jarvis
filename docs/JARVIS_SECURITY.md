# JARVIS Proactive Security — Phase 14 / 15

> JARVIS observe → corrèle → évalue → explique. L'humain décide.
> MONITORING + CORRELATION + ALERT ONLY. Jamais d'action système automatique.

```text
Observation (on-demand ou SecurityMonitor)
    ↓
Context
    ↓
SecuritySignals
    ↓
ThreatAssessment (+ hystérésis)
    ↓
RiskLevel (sévérité d'alerte)
    ↓
SecurityAlert (dédupliquée)
    ↓
(optionnel) Sophie security_alert — présentation seulement
```

## Architecture

| Module | Rôle |
|--------|------|
| `SecurityBaseline` | Baseline mémoire bornée + habits de session |
| `SecuritySignalCollector` | Diff observation vs baseline → signaux |
| `ThreatAssessmentEngine` | Score + corrélation légère |
| `SeverityStabilizer` | Hystérésis de sévérité (anti-flicker) |
| `SecurityAlertDeduper` | Regroupement firstSeen/lastSeen/occurrences |
| `SecurityAlert` | Message explicable + disclaimer |
| `SecurityService` | Façade `status` / `alerts` / `assess` |
| `SecurityMonitor` | Polling contrôlé (setTimeout récursif, pas setInterval) |
| `SecuritySimulator` | Scénarios hors-ligne (`mode: SIMULATION`) |

La couche `src/security/` **n'importe pas** `ActionExecutor`, `PermissionManager`, `FileService`, `ApplicationService`, `AnimationPlayer`, `BehaviorBrain`.

## Security Monitor (Phase 15)

```ts
SecurityMonitorConfig {
  enabled                     // défaut: false (CLI: JARVIS_SECURITY_MONITOR=1)
  observationIntervalMs       // défaut: 30000
  minObservationIntervalMs    // plancher: 5000
  assessmentCooldownMs        // défaut: 10000
  alertCooldownMs             // défaut: 60000
  baselineAbsorbMaxLevel      // défaut: LOW — n'absorbe pas les anomalies fortes
}
```

Statuts: `DISABLED` | `IDLE` | `OBSERVING` | `ASSESSING` | `ALERT` | `ERROR` | `UNAVAILABLE`

API: `security.monitor.status` — lecture seule.

Le monitor empêche les assessments concurrents, s'arrête proprement, et n'exécute jamais d'action.

## Signal model

```ts
SecuritySignal {
  id, category, kind, severity, confidence,
  timestamp, source, evidence[], reason
}
```

**Catégories :** `USER_PRESENCE` | `APPLICATION` | `SCREEN` | `FILE` | `SYSTEM` | `SESSION` | `ENVIRONMENT`

**Kinds utiles (Phase 15) :** `NEW_APPLICATION`, `UNUSUAL_APPLICATION`, `FRONTMOST_CHANGE`, `UNEXPECTED_APPLICATION_RETURN`, `UNUSUAL_FILE_ACTIVITY`, `UNUSUAL_SESSION_TRANSITION`, `UNUSUAL_SCREEN_CHANGE`, `UNUSUAL_ACTIVITY_PATTERN`

**Sévérités :** `INFO` | `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`

`CRITICAL` = sévérité d'alerte maximale uniquement. **Jamais** une autorisation d'agir.

## Baseline

- Mémoire uniquement, non persistante par défaut
- Historique borné (≤ 8 snapshots)
- Fréquences d'apps bornées (≤ 64) pour apprendre « habituel »
- Métadonnées seulement

**Ne stocke jamais :** screenshots, mots de passe, contenu de fichiers, frappe, clipboard, caméra, micro.

## Présence utilisateur

Buckets : `ACTIVE` | `RECENTLY_IDLE` | `IDLE` | `LONG_IDLE` | `UNKNOWN`

**IDLE ≠ ABSENT.**

## Threat assessment & corrélation

Moteur simple + stabilisation de sévérité. Une variation système **seule** reste ≤ `LOW`.

Scénarios bénins (Spotify/Chrome en idle) restent en général ≤ `LOW`.

## Alertes & API

- `security.status` / `security.alerts` / `security.assess`
- `security.monitor.status`

Chaque alerte : *Aucune action n'a été prise.*
Dédup : `firstSeen` / `lastSeen` / `occurrences`.

## Runtime & Sophie

« Montre-moi » = preuves déjà disponibles — **pas** de capture automatique.

Sophie : `security_alert` (`level`, `confidence`, `category`, `summary`) uniquement.

## WHAT JARVIS CANNOT CLAIM

- virus detection
- malware detection
- hacker detection
- physical presence
- identity recognition
- intrusion confirmation

**HUMAN DECIDES.**
