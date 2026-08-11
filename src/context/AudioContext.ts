/**
 * Phase 25 — Audio / Now Playing context (metadata-only, no recording).
 */

import type {
  AudioCapabilityKind,
  ContextFreshness,
  EnvAvailability,
} from "./EnvironmentContext.js";
import { computeFreshness } from "./EnvironmentContext.js";

export type PlaybackState = "playing" | "paused" | "stopped";

export interface AudioContext {
  available: EnvAvailability;
  observedAt: number | null;
  source: string;
  capabilityKind: AudioCapabilityKind;
  activeApplication: string | null;
  /** null = unknown — never false by default. */
  playing: boolean | null;
  playbackState: PlaybackState | null;
  volume: number | null;
  trackChanged: boolean | null;
  ageMs: number | null;
  freshness: ContextFreshness;
  reason?: string | null;
}

export function emptyAudioContext(now = Date.now()): AudioContext {
  return {
    available: "UNAVAILABLE",
    observedAt: null,
    source: "none",
    capabilityKind: "UNAVAILABLE",
    activeApplication: null,
    playing: null,
    playbackState: null,
    volume: null,
    trackChanged: null,
    ageMs: null,
    freshness: computeFreshness(null, now),
    reason:
      "Now Playing not available on macOS without per-app integration — open ≠ playing",
  };
}
