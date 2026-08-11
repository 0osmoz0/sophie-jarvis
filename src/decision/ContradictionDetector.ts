/**
 * Detects user corrections / contradictions in recent conversational signals.
 * Does not write memory. Does not authorize actions.
 */

export interface ContradictionInput {
  currentText: string;
  /** Recent user texts (newest last), content only for analysis — not logged. */
  recentUserTexts?: string[];
  /** Memory preference hint labels (e.g. preferred browser). */
  memoryPreferenceHints?: string[];
  /** Explicit application named in current resolved intent. */
  currentApplication?: string | null;
}

export interface ContradictionResult {
  detected: boolean;
  kind?:
    | "user_correction"
    | "memory_vs_explicit"
    | "keep_open_vs_close"
    | "none";
  /** Winning explicit preference when correction applies. */
  resolvedApplication?: string;
  notes: string[];
}

const CORRECTION =
  /^non[, ]+(.+)$/i;
const KEEP_OPEN =
  /non[, ]+(laisse|laisse[- ]le|laisse[- ]la|keep|ne (le |la )?ferme)/i;

export class ContradictionDetector {
  detect(input: ContradictionInput): ContradictionResult {
    const notes: string[] = [];
    const text = input.currentText.trim();

    if (KEEP_OPEN.test(text)) {
      return {
        detected: true,
        kind: "keep_open_vs_close",
        notes: [
          "User cancelled a close intent — needs clarification or NO_ACTION",
        ],
      };
    }

    const corr = text.match(CORRECTION);
    if (corr) {
      const target = corr[1]!.trim().replace(/[.?!,]+$/, "");
      if (target && !/^(celui|celle|ça|ca)\b/i.test(target)) {
        notes.push(`User correction toward: ${target}`);
        return {
          detected: true,
          kind: "user_correction",
          resolvedApplication: target,
          notes,
        };
      }
    }

    // Memory preference vs explicit current request
    if (
      input.currentApplication &&
      input.memoryPreferenceHints &&
      input.memoryPreferenceHints.length
    ) {
      const current = input.currentApplication.toLowerCase();
      for (const hint of input.memoryPreferenceHints) {
        const h = hint.toLowerCase();
        if (h && current && !h.includes(current) && !current.includes(h)) {
          // Explicit current wins — record as non-blocking contradiction note
          notes.push(
            `Memory preference "${hint}" differs from explicit "${input.currentApplication}" — explicit wins`,
          );
          return {
            detected: true,
            kind: "memory_vs_explicit",
            resolvedApplication: input.currentApplication,
            notes,
          };
        }
      }
    }

    return { detected: false, kind: "none", notes };
  }
}
