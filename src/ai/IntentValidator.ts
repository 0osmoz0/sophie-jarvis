import type {
  IntentValidationFailure,
  IntentValidationResult,
  JarvisActionIntentType,
  JarvisIntent,
} from "./types.js";
import {
  AI_ERROR_CODES,
  AI_LIMITS,
  JARVIS_ACTION_INTENT_TYPES,
  JARVIS_CONTEXT_INTENT_TYPES,
  JARVIS_SECURITY_INTENT_TYPES,
  NON_ACTION_INTENT_TYPES,
} from "./types.js";

const FORBIDDEN_KEYS = [
  "command",
  "shell",
  "exe" + "c",
  "spa" + "wn",
  "bas" + "h",
  "zs" + "h",
  "osa" + "script",
  "code",
  "script",
  "args",
  "argv",
  "eva" + "l",
  "child_" + "process",
] as const;

const FORBIDDEN_VALUE_PARTS = [
  "rm" + " -rf",
  "sudo" + " shutdown",
  "bash" + " -c",
  "zsh" + " -c",
  "osa" + "script",
  "child_" + "process",
  "Function" + "(",
  "new " + "Function",
  "eva" + "l(",
  "execute" + "(command",
] as const;

function payloadLooksForbidden(value: string): boolean {
  const lower = value.toLowerCase();
  for (const part of FORBIDDEN_VALUE_PARTS) {
    if (lower.includes(part.toLowerCase())) return true;
  }
  return false;
}

/**
 * IntentValidator — treat all LLM output as untrusted.
 */
export class IntentValidator {
  validate(candidate: unknown): IntentValidationResult {
    if (candidate === null || candidate === undefined) {
      return fail(AI_ERROR_CODES.INVALID_INTENT, "Empty candidate");
    }

    if (typeof candidate === "string") {
      if (candidate.length > AI_LIMITS.maxLlmOutputChars) {
        return fail(AI_ERROR_CODES.OUTPUT_TOO_LONG, "String output too long");
      }
      // Conversational prose is not an action.
      if (!candidate.trim().startsWith("{")) {
        return fail(
          AI_ERROR_CODES.INVALID_INTENT,
          "Conversational output is not a structured intent",
        );
      }
      try {
        candidate = JSON.parse(candidate);
      } catch {
        return fail(AI_ERROR_CODES.INVALID_INTENT, "Invalid JSON");
      }
    }

    if (typeof candidate !== "object" || Array.isArray(candidate)) {
      return fail(AI_ERROR_CODES.INVALID_INTENT, "Intent must be an object");
    }

    const obj = candidate as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (!keys.includes("type") || !keys.includes("payload")) {
      return fail(AI_ERROR_CODES.INVALID_INTENT, "Missing type or payload");
    }
    // Strict: only type + payload
    for (const key of keys) {
      if (key !== "type" && key !== "payload") {
        return fail(
          AI_ERROR_CODES.INVALID_INTENT,
          `Unknown field: ${key}`,
        );
      }
    }

    if (typeof obj.type !== "string") {
      return fail(AI_ERROR_CODES.INVALID_INTENT, "type must be string");
    }

    if (
      !obj.payload ||
      typeof obj.payload !== "object" ||
      Array.isArray(obj.payload)
    ) {
      return fail(AI_ERROR_CODES.INVALID_INTENT, "payload must be an object");
    }

    const payload = obj.payload as Record<string, unknown>;
    const forbiddenField = findForbiddenKey(payload);
    if (forbiddenField) {
      return fail(
        AI_ERROR_CODES.FORBIDDEN_CONTENT,
        `Forbidden payload field: ${forbiddenField}`,
      );
    }

    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === "string") {
        if (v.length > AI_LIMITS.maxPayloadStringChars) {
          return fail(
            AI_ERROR_CODES.OUTPUT_TOO_LONG,
            `Payload field ${k} too long`,
          );
        }
        if (payloadLooksForbidden(v)) {
          return fail(
            AI_ERROR_CODES.FORBIDDEN_CONTENT,
            `Forbidden content in payload field ${k}`,
          );
        }
      }
    }

    const type = obj.type;

    if ((NON_ACTION_INTENT_TYPES as readonly string[]).includes(type)) {
      return this.validateNonAction(type, payload);
    }

    if ((JARVIS_CONTEXT_INTENT_TYPES as readonly string[]).includes(type)) {
      const extra = Object.keys(payload);
      if (extra.length) {
        return fail(
          AI_ERROR_CODES.INVALID_INTENT,
          `Context intents require empty payload; got: ${extra.join(",")}`,
        );
      }
      return {
        ok: true,
        intent: {
          type: type as (typeof JARVIS_CONTEXT_INTENT_TYPES)[number],
          payload: {},
        },
      };
    }

    if ((JARVIS_SECURITY_INTENT_TYPES as readonly string[]).includes(type)) {
      const extra = Object.keys(payload);
      if (extra.length) {
        return fail(
          AI_ERROR_CODES.INVALID_INTENT,
          `Security intents require empty payload; got: ${extra.join(",")}`,
        );
      }
      return {
        ok: true,
        intent: {
          type: type as (typeof JARVIS_SECURITY_INTENT_TYPES)[number],
          payload: {},
        },
      };
    }

    if (!(JARVIS_ACTION_INTENT_TYPES as readonly string[]).includes(type)) {
      return fail(
        AI_ERROR_CODES.UNKNOWN_ACTION,
        `Unknown action type: ${type}`,
      );
    }

    return this.validateAction(type as JarvisActionIntentType, payload);
  }

  private validateNonAction(
    type: string,
    payload: Record<string, unknown>,
  ): IntentValidationResult {
    switch (type) {
      case "conversation": {
        const extra = Object.keys(payload).filter((k) => k !== "replyHint");
        if (extra.length) {
          return fail(
            AI_ERROR_CODES.INVALID_INTENT,
            `Unknown payload fields: ${extra.join(",")}`,
          );
        }
        if (
          payload.replyHint !== undefined &&
          typeof payload.replyHint !== "string"
        ) {
          return fail(AI_ERROR_CODES.INVALID_INTENT, "replyHint must be string");
        }
        return {
          ok: true,
          intent: {
            type: "conversation",
            payload: {
              replyHint:
                typeof payload.replyHint === "string"
                  ? payload.replyHint
                  : undefined,
            },
          },
        };
      }
      case "no_action": {
        const extra = Object.keys(payload).filter((k) => k !== "reason");
        if (extra.length) {
          return fail(
            AI_ERROR_CODES.INVALID_INTENT,
            `Unknown payload fields: ${extra.join(",")}`,
          );
        }
        if (
          payload.reason !== undefined &&
          typeof payload.reason !== "string"
        ) {
          return fail(AI_ERROR_CODES.INVALID_INTENT, "reason must be string");
        }
        return {
          ok: true,
          intent: {
            type: "no_action",
            payload: {
              reason:
                typeof payload.reason === "string" ? payload.reason : undefined,
            },
          },
        };
      }
      case "needs_clarification": {
        if (typeof payload.question !== "string" || !payload.question.trim()) {
          return fail(
            AI_ERROR_CODES.INVALID_INTENT,
            "needs_clarification requires question string",
          );
        }
        const extra = Object.keys(payload).filter((k) => k !== "question");
        if (extra.length) {
          return fail(
            AI_ERROR_CODES.INVALID_INTENT,
            `Unknown payload fields: ${extra.join(",")}`,
          );
        }
        return {
          ok: true,
          intent: {
            type: "needs_clarification",
            payload: { question: payload.question },
          },
        };
      }
      default:
        return fail(AI_ERROR_CODES.UNKNOWN_ACTION, `Unknown type: ${type}`);
    }
  }

  private validateAction(
    type: JarvisActionIntentType,
    payload: Record<string, unknown>,
  ): IntentValidationResult {
    switch (type) {
      case "file.copy":
      case "file.move": {
        const source = requireString(payload, "source");
        if (!source.ok) return source;
        const destination = requireString(payload, "destination");
        if (!destination.ok) return destination;
        const allowed = new Set(["source", "destination"]);
        const extra = Object.keys(payload).filter((k) => !allowed.has(k));
        if (extra.length) {
          return fail(
            AI_ERROR_CODES.INVALID_INTENT,
            `Unknown payload fields: ${extra.join(",")}`,
          );
        }
        const intent: JarvisIntent =
          type === "file.copy"
            ? {
                type: "file.copy",
                payload: {
                  source: source.value,
                  destination: destination.value,
                },
              }
            : {
                type: "file.move",
                payload: {
                  source: source.value,
                  destination: destination.value,
                },
              };
        return { ok: true, intent };
      }
      case "file.create": {
        const path = requireString(payload, "path");
        if (!path.ok) return path;
        if (
          payload.content !== undefined &&
          typeof payload.content !== "string"
        ) {
          return fail(AI_ERROR_CODES.INVALID_INTENT, "content must be string");
        }
        const extra = Object.keys(payload).filter(
          (k) => k !== "path" && k !== "content",
        );
        if (extra.length) {
          return fail(
            AI_ERROR_CODES.INVALID_INTENT,
            `Unknown payload fields: ${extra.join(",")}`,
          );
        }
        return {
          ok: true,
          intent: {
            type: "file.create",
            payload: {
              path: path.value,
              content:
                typeof payload.content === "string"
                  ? payload.content
                  : undefined,
            },
          },
        };
      }
      case "file.delete": {
        const path = requireString(payload, "path");
        if (!path.ok) return path;
        const extra = Object.keys(payload).filter((k) => k !== "path");
        if (extra.length) {
          return fail(
            AI_ERROR_CODES.INVALID_INTENT,
            `Unknown payload fields: ${extra.join(",")}`,
          );
        }
        return {
          ok: true,
          intent: { type: "file.delete", payload: { path: path.value } },
        };
      }
      case "application.open":
      case "application.close": {
        const application = requireString(payload, "application");
        if (!application.ok) return application;
        const extra = Object.keys(payload).filter((k) => k !== "application");
        if (extra.length) {
          return fail(
            AI_ERROR_CODES.INVALID_INTENT,
            `Unknown payload fields: ${extra.join(",")}`,
          );
        }
        const intent: JarvisIntent =
          type === "application.open"
            ? {
                type: "application.open",
                payload: { application: application.value },
              }
            : {
                type: "application.close",
                payload: { application: application.value },
              };
        return { ok: true, intent };
      }
    }
  }
}

function requireString(
  payload: Record<string, unknown>,
  key: string,
):
  | { ok: true; value: string }
  | IntentValidationFailure {
  const v = payload[key];
  if (typeof v !== "string" || !v.trim()) {
    return fail(
      AI_ERROR_CODES.INVALID_INTENT,
      `Missing or invalid string field: ${key}`,
    );
  }
  if (v.length > AI_LIMITS.maxPayloadStringChars) {
    return fail(AI_ERROR_CODES.OUTPUT_TOO_LONG, `Field ${key} too long`);
  }
  return { ok: true, value: v };
}

function findForbiddenKey(payload: Record<string, unknown>): string | null {
  for (const key of Object.keys(payload)) {
    const lower = key.toLowerCase();
    if ((FORBIDDEN_KEYS as readonly string[]).includes(lower)) {
      return key;
    }
  }
  return null;
}

function fail(code: string, message: string): IntentValidationFailure {
  return { ok: false, code, message };
}
