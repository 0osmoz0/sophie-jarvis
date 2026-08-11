/**
 * Phase 23 — Voice PRE-AUDIT (read-only).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const report = [
    "=== JARVIS VOICE PRE-AUDIT — PHASE 23 ===",
    "",
    "1. Microphone abstraction? NO (UserActivityPolicy.allowsAudioInput()=false)",
    "2. Audio output abstraction? NO",
    "3. STT existing? NO",
    "4. TTS existing? NO",
    "5. VoiceService existing? NO",
    "6. Local solution? Future: SFSpeechRecognizer / AVSpeechSynthesizer via native bridge",
    "7. External API? Optional future only if explicitly configured — not required for Phase 23",
    "8. macOS permissions? Microphone TCC for real STT; none for Mock",
    "9. Without microphone? YES — CLI/text + Mock STT inject / Unavailable STT honest error",
    "10. Without TTS? YES — text response; TTS failure never becomes action failure",
    "11. Optional parts? Entire voice module optional; runtime works without it",
    "12. Voice unavailable? VOICE_STT_UNAVAILABLE / PERMISSION_REQUIRED honest messages",
    "",
    "SECURITY BOUNDARY",
    "-----------------",
    "Voice → text → JarvisRuntime.processInput (Phase 8 confirmation token unchanged)",
    "STT confidence ≠ authorization",
    "No wake word / no continuous recording in Phase 23",
    "",
    "PRE-AUDIT STATUS: COMPLETE (read-only)",
  ].join("\n");

  console.log(report);
  const out = path.join(
    ROOT,
    "tools/.audit-cache/jarvis-voice-phase23-preaudit.txt",
  );
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, report + "\n", "utf8");
  console.log(`\nWrote ${path.relative(ROOT, out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
