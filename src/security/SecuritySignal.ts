import type {
  SecurityEvidenceItem,
  SecuritySeverity,
  SecuritySignal,
  SecuritySignalCategory,
} from "./types.js";

let seq = 0;

export function createSecuritySignal(input: {
  category: SecuritySignalCategory;
  kind: string;
  severity: SecuritySeverity;
  confidence: number;
  source?: string;
  evidence?: SecurityEvidenceItem[];
  reason: string;
  timestamp?: number;
}): SecuritySignal {
  seq += 1;
  const confidence = Math.max(0, Math.min(1, input.confidence));
  return {
    id: `sig_${Date.now()}_${seq}`,
    category: input.category,
    kind: input.kind,
    severity: input.severity,
    confidence,
    timestamp: input.timestamp ?? Date.now(),
    source: input.source ?? "SecuritySignalCollector",
    evidence: input.evidence ?? [],
    reason: input.reason,
  };
}

export function appKey(app: {
  bundleId?: string | null;
  name?: string | null;
  id?: string | null;
}): string | null {
  const bid = app.bundleId?.trim();
  if (bid) return `bundle:${bid.toLowerCase()}`;
  const name = app.name?.trim();
  if (name) return `name:${name.toLowerCase()}`;
  const id = app.id?.trim();
  if (id) return `id:${id.toLowerCase()}`;
  return null;
}
