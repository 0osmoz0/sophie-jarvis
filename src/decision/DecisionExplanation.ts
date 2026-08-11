import type { Decision } from "./types.js";

/**
 * Concise verifiable explanation — never dumps prompts, tokens, or secrets.
 */
export class DecisionExplanation {
  format(decision: Decision): string {
    const lines: string[] = [
      "## DECISION",
      `type: ${decision.type}`,
      `confidence: ${decision.confidence.toFixed(2)} (${decision.confidenceCategory})`,
      `risk: ${decision.riskLevel ?? "n/a"}`,
      `origin: ${decision.origin}`,
      "",
      "## WHY",
    ];
    for (const r of decision.reasons.slice(0, 6)) {
      lines.push(`- ${sanitize(r)}`);
    }
    if (!decision.reasons.length) {
      lines.push("- (none)");
    }
    lines.push("", "## EVIDENCE");
    for (const e of decision.evidence.slice(0, 8)) {
      lines.push(`- [${e.source}] ${sanitize(e.summary)}`);
    }
    if (!decision.evidence.length) {
      lines.push("- (none)");
    }
    lines.push("", "## MISSING");
    if (decision.missingInformation.length) {
      for (const m of decision.missingInformation.slice(0, 6)) {
        lines.push(`- ${sanitize(m)}`);
      }
    } else {
      lines.push("- (none)");
    }
    lines.push("", "## NEXT STEP");
    lines.push(`- ${sanitize(nextStep(decision))}`);
    return lines.join("\n");
  }
}

function nextStep(d: Decision): string {
  switch (d.type) {
    case "ACTION":
      return d.requiresConfirmation
        ? "Request user confirmation via Phase 8 token (no auto-execute)."
        : "Hand to ActionPlanner / PermissionManager (still no LLM execute).";
    case "CLARIFICATION":
    case "INFORMATION_REQUIRED":
      return d.clarificationQuestion ?? "Ask the user for the missing variable.";
    case "ANSWER":
      return "Respond with information only (no system action).";
    case "REFUSAL":
      return "Refuse safely; do not plan or execute.";
    case "NO_ACTION":
      return "Acknowledge without planning an action.";
    case "DEFER":
      return "Defer; wait for clearer input or service availability.";
    default:
      return "No further step.";
  }
}

function sanitize(s: string): string {
  return s
    .replace(/sk-[a-zA-Z0-9]{10,}/g, "[redacted]")
    .replace(/bearer\s+\S+/gi, "[redacted]")
    .replace(/password\s*[:=]\s*\S+/gi, "[redacted]")
    .slice(0, 240);
}
