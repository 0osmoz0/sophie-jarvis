import type { EntityTracker } from "./EntityTracker.js";
import type {
  ConversationEntity,
  ConversationEntityType,
  ReferenceResolveResult,
} from "./types.js";

export interface EnvironmentHints {
  activeApplication?: string | null;
  openApplications?: string[];
}

export interface ReferenceResolverOptions {
  /**
   * When true, may use environment as a lower-priority hint
   * (never overrides an explicit conversational reference).
   */
  allowEnvironment?: boolean;
}

const REF_PATTERNS: Array<{
  re: RegExp;
  preferredType?: ConversationEntityType;
  label: string;
}> = [
  { re: /\bce fichier\b/i, preferredType: "file", label: "ce fichier" },
  {
    re: /\bcette application\b/i,
    preferredType: "application",
    label: "cette application",
  },
  { re: /\bce projet\b/i, preferredType: "project", label: "ce projet" },
  { re: /\bcelui[- ]là\b/i, label: "celui-là" },
  { re: /\bcelle[- ]là\b/i, label: "celle-là" },
  { re: /\ble précédent\b/i, label: "le précédent" },
  { re: /\bl['']autre\b/i, label: "l'autre" },
  { re: /\bferme[- ]le\b/i, preferredType: "application", label: "ferme-le" },
  { re: /\bouvre[- ]le\b/i, preferredType: "application", label: "ouvre-le" },
  { re: /\bcopie[- ]le\b/i, preferredType: "file", label: "copie-le" },
  { re: /\bsupprime[- ]le\b/i, preferredType: "file", label: "supprime-le" },
  { re: /\brange[- ]ça\b/i, label: "range-ça" },
  { re: /\brange ca\b/i, label: "range ca" },
  { re: /\bfais[- ]le\b/i, preferredType: "action", label: "fais-le" },
  {
    re: /\bferme\s+l['']application\s+ouverte\b/i,
    preferredType: "application",
    label: "app ouverte",
  },
  { re: /^(le|la|ça|celui[- ]là|celle[- ]là|l['']autre)\.?$/i, label: "bare-ref" },
];

/**
 * Resolves anaphoric references from recent conversational entities.
 * Ambiguity → unresolved (clarification). Never authorizes actions.
 */
export class ReferenceResolver {
  private readonly allowEnvironment: boolean;

  constructor(options: ReferenceResolverOptions = {}) {
    this.allowEnvironment = options.allowEnvironment !== false;
  }

  /**
   * Detect whether the text contains a deixis / pronoun that needs resolution.
   */
  needsResolution(text: string): boolean {
    const t = text.trim();
    if (!t) return false;
    for (const p of REF_PATTERNS) {
      if (p.re.test(t)) return true;
    }
    // Bare pronouns as full message
    if (/^(le|la|ça|celui[- ]là|celle[- ]là|l['']autre)\.?$/i.test(t)) {
      return true;
    }
    return false;
  }

  resolve(
    text: string,
    entities: EntityTracker,
    environment?: EnvironmentHints,
  ): ReferenceResolveResult {
    const t = text.trim();
    if (!this.needsResolution(t)) {
      return {
        status: "none",
        resolved: false,
        confidence: 0,
        reason: "no_reference",
      };
    }

    let preferredType: ConversationEntityType | undefined;
    let matchedPattern: string | undefined;
    let wantOther = false;

    for (const p of REF_PATTERNS) {
      if (p.re.test(t)) {
        preferredType = p.preferredType;
        matchedPattern = p.label;
        if (p.label === "l'autre") wantOther = true;
        break;
      }
    }

    if (/ferme\s+l['']application\s+ouverte/i.test(t)) {
      return this.resolveFromEnvironment(environment, matchedPattern ?? "app ouverte");
    }

    const pool = preferredType
      ? entities.byType(preferredType, 8)
      : entities.recent(8).filter((e) => e.type !== "action");

    if (wantOther && pool.length >= 2) {
      const other = pool[1]!;
      return {
        status: "resolved",
        resolved: true,
        entity: other,
        candidates: pool.slice(0, 3),
        confidence: 0.85,
        matchedPattern,
        reason: "other_of_two",
      };
    }

    if (pool.length === 1) {
      return {
        status: "resolved",
        resolved: true,
        entity: pool[0],
        candidates: pool,
        confidence: Math.min(0.97, pool[0]!.confidence + 0.05),
        matchedPattern,
      };
    }

    if (pool.length > 1) {
      // Same label duplicates collapsed already — distinct labels → ambiguous
      const uniqueLabels = uniqueByLabel(pool);
      if (uniqueLabels.length === 1) {
        return {
          status: "resolved",
          resolved: true,
          entity: uniqueLabels[0],
          candidates: uniqueLabels,
          confidence: 0.95,
          matchedPattern,
        };
      }
      return {
        status: "ambiguous",
        resolved: false,
        candidates: uniqueLabels.slice(0, 5),
        confidence: 0.4,
        matchedPattern,
        reason: "ambiguous",
      };
    }

    // Priority: conversation empty → environment (lower) — never invent.
    if (this.allowEnvironment && preferredType === "application") {
      const env = this.resolveFromEnvironment(environment, matchedPattern);
      if (env.resolved || env.status === "ambiguous") return env;
    }

    return {
      status: "unresolved",
      resolved: false,
      confidence: 0,
      matchedPattern,
      reason: "no_candidates",
    };
  }

  private resolveFromEnvironment(
    environment: EnvironmentHints | undefined,
    matchedPattern?: string,
  ): ReferenceResolveResult {
    if (!environment) {
      return {
        status: "unresolved",
        resolved: false,
        confidence: 0,
        matchedPattern,
        reason: "no_environment",
      };
    }
    const open = (environment.openApplications ?? []).filter(Boolean);
    const active = environment.activeApplication?.trim() || null;

    if (active && (open.length <= 1 || open.includes(active))) {
      const entity: ConversationEntity = {
        id: `env_app_${active.toLowerCase()}`,
        type: "application",
        label: active,
        lastMentionedAt: Date.now(),
        sourceMessageId: "environment",
        confidence: 0.8,
      };
      return {
        status: "resolved",
        resolved: true,
        entity,
        candidates: [entity],
        confidence: 0.8,
        matchedPattern,
        reason: "environment_active",
      };
    }

    if (open.length === 1) {
      const label = open[0]!;
      const entity: ConversationEntity = {
        id: `env_app_${label.toLowerCase()}`,
        type: "application",
        label,
        lastMentionedAt: Date.now(),
        sourceMessageId: "environment",
        confidence: 0.75,
      };
      return {
        status: "resolved",
        resolved: true,
        entity,
        candidates: [entity],
        confidence: 0.75,
        matchedPattern,
        reason: "environment_single_open",
      };
    }

    if (open.length > 1) {
      const candidates = open.slice(0, 5).map((label) => ({
        id: `env_app_${label.toLowerCase()}`,
        type: "application" as const,
        label,
        lastMentionedAt: Date.now(),
        sourceMessageId: "environment",
        confidence: 0.5,
      }));
      return {
        status: "ambiguous",
        resolved: false,
        candidates,
        confidence: 0.35,
        matchedPattern,
        reason: "ambiguous_environment",
      };
    }

    return {
      status: "unresolved",
      resolved: false,
      confidence: 0,
      matchedPattern,
      reason: "empty_environment",
    };
  }
}

function uniqueByLabel(entities: ConversationEntity[]): ConversationEntity[] {
  const seen = new Set<string>();
  const out: ConversationEntity[] = [];
  for (const e of entities) {
    const k = e.label.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/**
 * Apply a resolved entity into a concrete user text for downstream intent parsing.
 * Does not grant permissions.
 */
export function applyResolvedReference(
  text: string,
  entity: ConversationEntity,
): string {
  const t = text.trim();
  if (/^ferme[- ]le\.?$/i.test(t) && entity.type === "application") {
    return `ferme ${entity.label}`;
  }
  if (/^ouvre[- ]le\.?$/i.test(t) && entity.type === "application") {
    return `ouvre ${entity.label}`;
  }
  if (/^copie[- ]le\.?$/i.test(t) && entity.type === "file") {
    return `copie ${entity.label}`;
  }
  if (/^supprime[- ]le\.?$/i.test(t) || /^supprime ce fichier\.?$/i.test(t)) {
    if (entity.type === "file") return `supprime ${entity.label}`;
  }
  if (/ferme\s+l['']application\s+ouverte/i.test(t) && entity.type === "application") {
    return `ferme ${entity.label}`;
  }
  if (/\bce fichier\b/i.test(t) && entity.type === "file") {
    return t.replace(/\bce fichier\b/i, entity.label);
  }
  if (/\bcette application\b/i.test(t) && entity.type === "application") {
    return t.replace(/\bcette application\b/i, entity.label);
  }
  if (/\bce projet\b/i.test(t) && entity.type === "project") {
    return t.replace(/\bce projet\b/i, entity.label);
  }
  return `${t} (${entity.type}: ${entity.label})`;
}

export function clarificationQuestion(result: ReferenceResolveResult): string {
  if (result.status === "ambiguous" && result.candidates?.length) {
    const labels = result.candidates.map((c) => c.label);
    if (labels.length === 2) {
      return `Tu parles de ${labels[0]} ou de ${labels[1]} ?`;
    }
    return `Précise la cible : ${labels.join(", ")}.`;
  }
  if (result.status === "unresolved") {
    return "Précise la cible (chemin ou application).";
  }
  return "Peux-tu préciser ?";
}
