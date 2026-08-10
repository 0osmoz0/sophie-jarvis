import { createHash } from "node:crypto";
import type { ActionPayload, ActionType } from "./types.js";
import { FORBIDDEN_PAYLOAD_KEYS } from "./types.js";

const SHELL_META = /[;&|`$()]/;

export function hashPayload(payload: unknown): string {
  const canonical = JSON.stringify(sortKeys(payload));
  return createHash("sha256").update(canonical).digest("hex");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}

export function rejectForbiddenPayloadFields(
  payload: Record<string, unknown>,
): string | null {
  for (const key of Object.keys(payload)) {
    const lower = key.toLowerCase();
    if (
      (FORBIDDEN_PAYLOAD_KEYS as readonly string[]).includes(lower) ||
      lower.includes("command") ||
      lower.includes("shell")
    ) {
      return `Forbidden payload field: ${key}`;
    }
  }
  return null;
}

/** Secondary heuristic — typed validators remain the primary control. */
export function rejectShellLikeStrings(
  payload: Record<string, unknown>,
): string | null {
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value !== "string") continue;
    if (SHELL_META.test(value)) {
      return `Payload field "${key}" contains forbidden shell-like characters`;
    }
  }
  return null;
}

export function validateFileCopyPayload(
  raw: Record<string, unknown>,
): { ok: true; payload: ActionPayload } | { ok: false; reason: string } {
  const forbidden = rejectForbiddenPayloadFields(raw) ?? rejectShellLikeStrings(raw);
  if (forbidden) return { ok: false, reason: forbidden };
  if (typeof raw.source !== "string" || raw.source.length === 0) {
    return { ok: false, reason: "FILE_COPY requires string source" };
  }
  if (typeof raw.destination !== "string" || raw.destination.length === 0) {
    return { ok: false, reason: "FILE_COPY requires string destination" };
  }
  const payload: ActionPayload = {
    source: raw.source,
    destination: raw.destination,
  };
  if (raw.overwrite !== undefined) {
    if (typeof raw.overwrite !== "boolean") {
      return { ok: false, reason: "overwrite must be boolean" };
    }
    (payload as { overwrite?: boolean }).overwrite = raw.overwrite;
  }
  return { ok: true, payload };
}

export function validateFileMovePayload(
  raw: Record<string, unknown>,
): { ok: true; payload: ActionPayload } | { ok: false; reason: string } {
  return validateFileCopyPayload(raw);
}

export function validateFileCreatePayload(
  raw: Record<string, unknown>,
): { ok: true; payload: ActionPayload } | { ok: false; reason: string } {
  const forbidden = rejectForbiddenPayloadFields(raw) ?? rejectShellLikeStrings(raw);
  if (forbidden) return { ok: false, reason: forbidden };
  if (typeof raw.path !== "string" || raw.path.length === 0) {
    return { ok: false, reason: "FILE_CREATE requires string path" };
  }
  if (raw.content !== undefined && typeof raw.content !== "string") {
    return { ok: false, reason: "content must be string" };
  }
  const payload: ActionPayload = {
    path: raw.path,
    content: typeof raw.content === "string" ? raw.content : undefined,
  };
  if (raw.overwrite !== undefined) {
    if (typeof raw.overwrite !== "boolean") {
      return { ok: false, reason: "overwrite must be boolean" };
    }
    (payload as { overwrite?: boolean }).overwrite = raw.overwrite;
  }
  return { ok: true, payload };
}

export function validateFileDeletePayload(
  raw: Record<string, unknown>,
): { ok: true; payload: ActionPayload } | { ok: false; reason: string } {
  const forbidden = rejectForbiddenPayloadFields(raw) ?? rejectShellLikeStrings(raw);
  if (forbidden) return { ok: false, reason: forbidden };
  if (typeof raw.path !== "string" || raw.path.length === 0) {
    return { ok: false, reason: "FILE_DELETE requires string path" };
  }
  if ("recursive" in raw && raw.recursive === true) {
    return { ok: false, reason: "recursive delete is not allowed via actions" };
  }
  return { ok: true, payload: { path: raw.path } };
}

export function validateAppOpenPayload(
  raw: Record<string, unknown>,
): { ok: true; payload: ActionPayload } | { ok: false; reason: string } {
  const forbidden = rejectForbiddenPayloadFields(raw) ?? rejectShellLikeStrings(raw);
  if (forbidden) return { ok: false, reason: forbidden };
  if (typeof raw.applicationId !== "string" || raw.applicationId.length === 0) {
    return { ok: false, reason: "APP_OPEN requires string applicationId" };
  }
  return { ok: true, payload: { applicationId: raw.applicationId } };
}

export function validateAppClosePayload(
  raw: Record<string, unknown>,
): { ok: true; payload: ActionPayload } | { ok: false; reason: string } {
  return validateAppOpenPayload(raw);
}

export type PayloadValidator = (
  raw: Record<string, unknown>,
) => { ok: true; payload: ActionPayload } | { ok: false; reason: string };

export function validatorFor(type: ActionType): PayloadValidator {
  switch (type) {
    case "FILE_COPY":
      return validateFileCopyPayload;
    case "FILE_MOVE":
      return validateFileMovePayload;
    case "FILE_CREATE":
      return validateFileCreatePayload;
    case "FILE_DELETE":
      return validateFileDeletePayload;
    case "APP_OPEN":
      return validateAppOpenPayload;
    case "APP_CLOSE":
      return validateAppClosePayload;
  }
}
