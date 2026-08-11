import type { ContextQueryKind, ContextSnapshot } from "./types.js";

/**
 * ContextFormatter — human-readable context from real snapshot values only.
 */
export class ContextFormatter {
  format(snapshot: ContextSnapshot, query: ContextQueryKind): string {
    switch (query) {
      case "system.status":
        return this.formatSystem(snapshot);
      case "application.status":
        return this.formatApplications(snapshot);
      case "screen.status":
        return this.formatScreen(snapshot);
      case "user.status":
        return this.formatUser(snapshot);
      case "system.context":
      default:
        return this.formatFull(snapshot);
    }
  }

  private formatFull(snapshot: ContextSnapshot): string {
    const lines: string[] = [];
    lines.push(this.formatSystem(snapshot));
    lines.push("");
    lines.push(this.formatApplications(snapshot));
    lines.push("");
    lines.push(this.formatScreen(snapshot));
    lines.push("");
    lines.push(this.formatUser(snapshot));
    if (snapshot.memory) {
      lines.push("");
      lines.push(this.formatMemory(snapshot));
    }
    lines.push("");
    lines.push(
      "Certaines informations peuvent être indisponibles selon les permissions macOS.",
    );
    return lines.join("\n");
  }

  private formatMemory(snapshot: ContextSnapshot): string {
    const m = snapshot.memory;
    if (!m || m.status !== "available") {
      return `Mémoire : ${m ? statusLabel(m.status) : "indisponible"}${m?.reason ? ` (${m.reason})` : ""}`;
    }
    const lines = [`Mémoire pertinente (${m.count ?? m.relevant?.length ?? 0}) :`];
    const items = m.relevant ?? [];
    if (items.length === 0) {
      lines.push("• (aucun souvenir pertinent)");
    } else {
      for (const r of items.slice(0, 5)) {
        lines.push(`• [${r.kind}] ${r.content}`);
      }
    }
    return lines.join("\n");
  }

  private formatSystem(snapshot: ContextSnapshot): string {
    const s = snapshot.system;
    if (s.status !== "available") {
      return `Système : ${statusLabel(s.status)}${s.reason ? ` (${s.reason})` : ""}`;
    }
    const lines = ["Ton Mac fonctionne normalement.", ""];
    if (s.os) lines.push(`OS : ${s.os}${s.architecture ? ` / ${s.architecture}` : ""}`);
    if (s.cpu) {
      lines.push(
        `CPU : ${s.cpu.model ?? "disponible"}${s.cpu.cores != null ? ` (${s.cpu.cores} cœurs)` : ""}`,
      );
    } else {
      lines.push("CPU : disponible");
    }
    if (s.memory?.freeBytes != null) {
      lines.push(`Mémoire : ${formatBytes(s.memory.freeBytes)} libres`);
    } else {
      lines.push("Mémoire : disponible");
    }
    if (s.uptimeSeconds != null) {
      lines.push(`Uptime : ${formatUptime(s.uptimeSeconds)}`);
    }
    return lines.join("\n");
  }

  private formatApplications(snapshot: ContextSnapshot): string {
    const a = snapshot.applications;
    if (a.status !== "available") {
      return `Applications : ${statusLabel(a.status)}${a.reason ? ` — ${a.reason}` : ""}`;
    }
    const lines = ["Applications :"];
    const names =
      a.running
        ?.map((x) => x.name)
        .filter((n): n is string => typeof n === "string" && n.length > 0) ?? [];
    if (names.length === 0) {
      lines.push("• (aucune listée)");
    } else {
      for (const name of names.slice(0, 20)) {
        lines.push(`• ${name}`);
      }
    }
    if (a.active?.name) {
      lines.push(`Active : ${a.active.name}`);
    }
    return lines.join("\n");
  }

  private formatScreen(snapshot: ContextSnapshot): string {
    const s = snapshot.screen;
    if (s.status !== "available") {
      return `Écran : ${statusLabel(s.status)}${s.reason ? ` — ${s.reason}` : ""}`;
    }
    const count = s.displays?.length ?? 0;
    const lines = ["Écran :", `• ${count} écran${count > 1 ? "s" : ""} détecté${count > 1 ? "s" : ""}`];
    for (const d of s.displays ?? []) {
      const scale =
        d.scaleFactor != null ? ` @${d.scaleFactor}x` : "";
      lines.push(
        `• ${d.id ?? "?"}: ${d.width ?? "?"}×${d.height ?? "?"}${scale}${d.isPrimary ? " (principal)" : ""}`,
      );
    }
    if (s.activeWindow?.title || s.activeWindow?.applicationName) {
      lines.push(
        `• Fenêtre active : ${s.activeWindow.applicationName ?? "?"}${s.activeWindow.title ? ` — ${s.activeWindow.title}` : ""}`,
      );
    }
    if (s.session) {
      if (s.session.status === "unknown") {
        lines.push("• Session : inconnue (non inventée)");
      } else if (s.session.locked === true) {
        lines.push("• Session : verrouillée");
      } else if (s.session.locked === false) {
        lines.push("• Session : déverrouillée");
      } else {
        lines.push("• Session : état partiel / inconnu");
      }
    }
    return lines.join("\n");
  }

  private formatUser(snapshot: ContextSnapshot): string {
    const lines: string[] = ["Activité :"];
    const act = snapshot.activity;
    if (act.status !== "available") {
      lines.push(`• ${statusLabel(act.status)}${act.reason ? ` — ${act.reason}` : ""}`);
    } else {
      const state = (act.state ?? "UNKNOWN").toLowerCase();
      lines.push(`• ${state}`);
      if (act.idleSeconds != null) {
        lines.push(`• inactif depuis ${Math.round(act.idleSeconds)}s`);
      }
    }
    const p = snapshot.presence;
    lines.push("Présence :");
    if (p.status !== "available") {
      lines.push(`• ${statusLabel(p.status)}`);
    } else {
      lines.push(
        `• ${p.presence ?? "UNKNOWN"}${p.confidence != null ? ` (confiance ${p.confidence})` : ""}`,
      );
      lines.push("• IDLE ne prouve pas une absence physique.");
    }
    return lines.join("\n");
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "available":
      return "disponible";
    case "unavailable":
      return "indisponible";
    case "permission_required":
      return "permission requise";
    case "unknown":
      return "inconnu";
    case "error":
      return "erreur";
    default:
      return status;
  }
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
