/**
 * Phase 25 — Cursor observation reader (read-only).
 */
import type { EnvAvailability } from "./EnvironmentContext.js";

export interface CursorReadResult {
  x: number;
  y: number;
  coordinateSpace: "cocoa-global-bottom-left";
}

export interface CursorReader {
  readonly name: string;
  getCapability(): { status: EnvAvailability; reason?: string | null };
  read(): CursorReadResult | null;
}

export interface FocusWindowReadResult {
  id: string | null;
  title: string | null;
  applicationName: string | null;
  bundleId: string | null;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface FocusReader {
  readonly name: string;
  getCapability(): { status: EnvAvailability; reason?: string | null };
  read(): FocusWindowReadResult | null;
}
