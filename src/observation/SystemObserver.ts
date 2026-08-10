import os from "node:os";
import type { BatteryInfo, CpuInfo, MemoryInfo, SystemObservation } from "./types.js";

/**
 * SystemObserver — read-only host metadata via Node `os` only.
 * No shell, no native bindings, no network.
 */
export class SystemObserver {
  observe(): SystemObservation {
    let platform: string | null = null;
    let arch: string | null = null;
    let hostname: string | null = null;
    let cpu: CpuInfo | null = null;
    let memory: MemoryInfo | null = null;
    let uptimeSeconds: number | null = null;

    try {
      platform = os.platform();
    } catch {
      platform = null;
    }

    try {
      arch = os.arch();
    } catch {
      arch = null;
    }

    try {
      hostname = os.hostname() || null;
    } catch {
      hostname = null;
    }

    try {
      const cpus = os.cpus();
      if (cpus && cpus.length > 0) {
        cpu = {
          model: cpus[0]?.model ?? null,
          speedMHz: cpus[0]?.speed ?? null,
          cores: cpus.length,
        };
      } else {
        cpu = null;
      }
    } catch {
      cpu = null;
    }

    try {
      memory = {
        totalBytes: os.totalmem(),
        freeBytes: os.freemem(),
      };
    } catch {
      memory = null;
    }

    try {
      uptimeSeconds = os.uptime();
    } catch {
      uptimeSeconds = null;
    }

    const battery: BatteryInfo = {
      percent: null,
      charging: null,
      available: false,
      reason:
        "Battery status requires platform-native APIs or shell; not used in Phase 2 (READ ONLY / no shell).",
    };

    return {
      availability: "available",
      reason: null,
      platform,
      arch,
      hostname,
      cpu,
      memory,
      uptimeSeconds,
      battery,
    };
  }
}
