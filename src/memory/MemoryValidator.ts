/**
 * MemoryValidator — schema + secret/command rejection (reasonable, not naive).
 */
import {
  MAX_CONTENT_CHARS,
  MAX_TAG_CHARS,
  MAX_TAGS,
  MEMORY_KINDS,
  type MemoryCandidate,
  type MemoryKind,
  type MemorySensitivity,
  type MemorySource,
} from "./types.js";

export interface MemoryValidationResult {
  ok: boolean;
  reason?: string;
  candidate?: MemoryCandidate;
}

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  {
    name: "password_assignment",
    re: /\b(password|passwd|mot\s*de\s*passe)\b\s*[:=]\s*\S+/i,
  },
  {
    name: "password_phrase",
    re: /\b(mon|my|le)\s+(password|passwd|mot\s*de\s*passe)\b.{0,40}\b(est|is|:|=)\b/i,
  },
  {
    name: "api_key",
    re: /\b(api[_ -]?key|access[_ -]?token|secret[_ -]?key|private[_ -]?key)\b\s*[:=]\s*\S+/i,
  },
  {
    name: "api_key_phrase",
    re: /\b(ma|my|la)\s+(clé\s*api|api\s*key|token)\b.{0,60}\b(est|is|:|=)\b/i,
  },
  {
    name: "bearer_token",
    re: /\b(bearer\s+[a-z0-9\-._~+\/]+=*|sk-[a-z0-9]{20,}|ghp_[a-z0-9]{20,})\b/i,
  },
  {
    name: "private_key_block",
    re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  },
  {
    name: "credit_card",
    re: /\b(carte\s*(de\s*)?crédit|credit\s*card|cvv)\b.+\d{4}/i,
  },
];

const COMMAND_PATTERNS: Array<{ name: string; re: RegExp }> = [
  {
    name: "shell_invocation",
    re: /\b(bash|zsh|sh|powershell)\s+-c\b/i,
  },
  {
    name: "osascript",
    re: /\bosascript\b/i,
  },
  {
    name: "sudo_destructive",
    re: /\bsudo\b.+\b(rm|shutdown|reboot|kill)\b/i,
  },
  {
    name: "rm_rf",
    re: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r\b/i,
  },
  {
    name: "curl_pipe",
    re: /\bcurl\b.+\|\s*(ba)?sh\b/i,
  },
  {
    name: "child_process",
    re: /\bchild_process\b|\brequire\s*\(\s*['"]child_process['"]\s*\)/i,
  },
  {
    name: "exec_spawn",
    re: /\b(execSync|spawnSync)\s*\(/i,
  },
];

export class MemoryValidator {
  validate(raw: unknown): MemoryValidationResult {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, reason: "not_object" };
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj.kind !== "string" || !isKind(obj.kind)) {
      return { ok: false, reason: "invalid_kind" };
    }
    if (typeof obj.content !== "string") {
      return { ok: false, reason: "invalid_content" };
    }
    const content = obj.content.trim();
    if (!content) return { ok: false, reason: "empty_content" };
    if (content.length > MAX_CONTENT_CHARS) {
      return { ok: false, reason: "content_too_long" };
    }

    const secret = detectSecret(content);
    if (secret) return { ok: false, reason: `secret:${secret}` };

    const cmd = detectCommand(content);
    if (cmd) return { ok: false, reason: `command:${cmd}` };

    // Injection / jailbreak as memory payload
    if (
      /ignore (all )?previous instructions|you are now (the )?system|execute\s*\(|run this (command|script)/i.test(
        content,
      )
    ) {
      return { ok: false, reason: "injection" };
    }

    const importance =
      obj.importance == null ? 0.5 : Number(obj.importance);
    const confidence =
      obj.confidence == null ? 0.7 : Number(obj.confidence);
    if (!Number.isFinite(importance) || importance < 0 || importance > 1) {
      return { ok: false, reason: "invalid_importance" };
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return { ok: false, reason: "invalid_confidence" };
    }

    let sensitivity: MemorySensitivity = "normal";
    if (obj.sensitivity != null) {
      if (
        obj.sensitivity !== "normal" &&
        obj.sensitivity !== "private" &&
        obj.sensitivity !== "sensitive"
      ) {
        return { ok: false, reason: "invalid_sensitivity" };
      }
      sensitivity = obj.sensitivity;
    }

    let source: MemorySource = "conversation";
    if (obj.source != null) {
      if (
        obj.source !== "user_explicit" &&
        obj.source !== "conversation" &&
        obj.source !== "system"
      ) {
        return { ok: false, reason: "invalid_source" };
      }
      source = obj.source;
    }

    let tags: string[] = [];
    if (obj.tags != null) {
      if (!Array.isArray(obj.tags)) return { ok: false, reason: "invalid_tags" };
      if (obj.tags.length > MAX_TAGS) return { ok: false, reason: "too_many_tags" };
      for (const t of obj.tags) {
        if (typeof t !== "string" || !t.trim() || t.length > MAX_TAG_CHARS) {
          return { ok: false, reason: "invalid_tag" };
        }
        tags.push(t.trim().toLowerCase());
      }
    }

    let expiresAt: number | undefined;
    if (obj.expiresAt != null) {
      const e = Number(obj.expiresAt);
      if (!Number.isFinite(e) || e < 0) {
        return { ok: false, reason: "invalid_expiresAt" };
      }
      expiresAt = e;
    }

    return {
      ok: true,
      candidate: {
        kind: obj.kind,
        content,
        importance,
        confidence,
        sensitivity,
        source,
        tags,
        expiresAt,
      },
    };
  }
}

function isKind(v: string): v is MemoryKind {
  return (MEMORY_KINDS as readonly string[]).includes(v);
}

export function detectSecret(content: string): string | null {
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(content)) return name;
  }
  return null;
}

export function detectCommand(content: string): string | null {
  for (const { name, re } of COMMAND_PATTERNS) {
    if (re.test(content)) return name;
  }
  return null;
}

export function normalizeMemoryContent(content: string): string {
  return content
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
