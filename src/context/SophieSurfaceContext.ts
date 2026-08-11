/**
 * Phase 26 — Surface / void observation (honest UNKNOWN when no physics).
 */

export interface SophieSurfaceContext {
  available: boolean;
  onValidSurface: boolean | null;
  inVoid: boolean | null;
  nearPerch: boolean | null;
  nearWindow: boolean | null;
  currentPerch: string | null;
  currentSurface: string | null;
  reason?: string | null;
}

export function emptySophieSurfaceContext(): SophieSurfaceContext {
  return {
    available: false,
    onValidSurface: null,
    inVoid: null,
    nearPerch: null,
    nearWindow: null,
    currentPerch: null,
    currentSurface: null,
    reason:
      "Surface/perch/void MISSING in jarvis repo — no physics/collision source",
  };
}
