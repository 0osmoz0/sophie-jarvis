/**
 * JARVIS interactive CLI — orchestrates Runtime only.
 * No shell spawning, no direct system mutation.
 */
import * as readline from "node:readline";
import path from "node:path";
import { PermissionManager } from "../permissions/PermissionManager.js";
import { FileService } from "../files/FileService.js";
import { MemoryFileAuditLog } from "../files/FileAuditLog.js";
import {
  ApplicationRegistry,
  ApplicationService,
  MemoryApplicationAuditLog,
  seedDefaultMacOSApplications,
} from "../applications/index.js";
import { ObservationService } from "../observation/ObservationService.js";
import { ScreenService } from "../screen/ScreenService.js";
import { UserActivityService } from "../presence/UserActivityService.js";
import { ContextService } from "../context/ContextService.js";
import { SophieIntegration } from "../integration/SophieIntegration.js";
import { SecurityService } from "../security/SecurityService.js";
import { SecurityMonitor } from "../security/SecurityMonitor.js";
import {
  contextSnapshotToSecurityObservation,
  contextSnapshotToSecuritySources,
} from "../security/fromContext.js";
import { MemoryService } from "../memory/MemoryService.js";
import { JsonMemoryPersistence } from "../memory/JsonMemoryPersistence.js";
import { ActionService } from "../actions/ActionService.js";
import { ActionConfirmation } from "../actions/ActionConfirmation.js";
import { IntentRouter } from "../ai/IntentRouter.js";
import { OllamaLLMProvider } from "../ai/OllamaLLMProvider.js";
import { MockLLMProvider } from "../ai/MockLLMProvider.js";
import { formatLLMHealth, probeLLMHealth } from "../ai/LLMHealth.js";
import { JarvisRuntime, formatTiming, formatPipelineTrace } from "./JarvisRuntime.js";
import { ResponseFormatter } from "./ResponseFormatter.js";

function banner(): void {
  console.log(`
╭──────────────────────────────╮
│        J.A.R.V.I.S.          │
│        Local Assistant        │
╰──────────────────────────────╯
`);
}

function createProductionRuntime(): {
  runtime: JarvisRuntime;
  securityMonitor: SecurityMonitor;
} {
  const useMock = process.env.JARVIS_LLM_PROVIDER === "mock";
  const provider = useMock
    ? new MockLLMProvider()
    : new OllamaLLMProvider();

  const files = new FileService({ audit: new MemoryFileAuditLog() });
  const allow = process.env.JARVIS_FILE_ALLOW_PATHS;
  if (allow) {
    files.setAllowedPaths(
      allow.split(",").map((p) => p.trim()).filter(Boolean),
    );
  }

  const appRegistry = new ApplicationRegistry();
  const seeded = seedDefaultMacOSApplications(appRegistry);
  const apps = new ApplicationService({
    registry: appRegistry,
    audit: new MemoryApplicationAuditLog(),
  });
  if (seeded > 0) {
    console.log(`(Applications registry: ${seeded} apps allowlisted)`);
  }
  const permissions = new PermissionManager();
  const actions = new ActionService({
    files,
    applications: apps,
    permissions,
    confirmation: new ActionConfirmation(),
  });
  const router = new IntentRouter({ provider, actions });
  let runtime!: JarvisRuntime;
  const sophieIntegration = new SophieIntegration({
    getRuntimeState: () => runtime.getState(),
  });
  const notifySophieAlert = (alert: {
    level: string;
    confidence: number;
    category: string;
    summary: string;
  }) => {
    sophieIntegration.notifySecurityAlert({
      level: alert.level,
      confidence: alert.confidence,
      category: String(alert.category),
      summary: alert.summary,
    });
  };
  const securityService = new SecurityService({
    onAlert: notifySophieAlert,
  });

  const memoryPath =
    process.env.JARVIS_MEMORY_PATH ??
    path.join(process.cwd(), ".jarvis", "memory.json");
  const persist =
    process.env.JARVIS_MEMORY_PERSIST === "0"
      ? undefined
      : new JsonMemoryPersistence({ filePath: memoryPath });
  const memoryService = new MemoryService({
    persistence: persist,
    autoload: true,
  });

  const contextService = new ContextService({
    observation: new ObservationService(),
    applications: apps,
    screen: new ScreenService(),
    activity: new UserActivityService(),
    sophieSignals: () => sophieIntegration.getContextSignals(),
    memoryRelevant: async () => {
      await memoryService.whenReady();
      const { records } = await memoryService.recall("préférences projets objectifs", {
        maxMemories: 3,
        maxCharacters: 400,
      });
      return {
        status: "available" as const,
        count: records.length,
        relevant: records.map((r) => ({
          id: r.id,
          kind: r.kind,
          content: r.content,
          confidence: r.confidence,
        })),
      };
    },
  });

  const monitorEnabled = process.env.JARVIS_SECURITY_MONITOR === "1";
  const securityMonitor = new SecurityMonitor(securityService, {
    getObservation: async () => {
      const snap = await contextService.getSnapshot("system.context");
      return contextSnapshotToSecurityObservation(snap.snapshot);
    },
    getSources: async () => {
      const snap = await contextService.getSnapshot("system.context");
      return contextSnapshotToSecuritySources(snap.snapshot);
    },
    config: {
      enabled: monitorEnabled,
      observationIntervalMs: 30_000,
      assessmentCooldownMs: 10_000,
      alertCooldownMs: 60_000,
    },
    onAlert: notifySophieAlert,
  });

  // Memory may inform security habits — never bypass
  void memoryService.whenReady().then(() => {
    securityService.baseline.markInformedHabitual(
      memoryService.applicationHints(),
    );
  });

  runtime = new JarvisRuntime({
    router,
    actions,
    contextService,
    sophieIntegration,
    securityService,
    securityMonitor,
    memoryService,
    formatter: new ResponseFormatter(),
  });
  return { runtime, securityMonitor };
}

async function main(): Promise<void> {
  banner();

  if (process.argv.includes("--health")) {
    const report = await probeLLMHealth();
    console.log(formatLLMHealth(report));
    console.log("");
    return;
  }

  const { runtime, securityMonitor } = createProductionRuntime();
  if (securityMonitor.getConfig().enabled) {
    securityMonitor.start();
    console.log(
      "(Security monitor: enabled — observation every 30s, alert only)",
    );
  }

  const formatter = new ResponseFormatter();
  const showTiming = process.argv.includes("--timing");
  const showTrace = process.argv.includes("--trace");
  const showMetrics = process.argv.includes("--metrics");

  console.log("JARVIS ready.");
  if (process.env.JARVIS_LLM_PROVIDER === "mock") {
    console.log("(LLM provider: mock — tests/dev only)");
  }
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const shutdown = (): void => {
    securityMonitor.stop();
    if (showMetrics) {
      console.log(runtime.formatMetrics());
    }
    console.log("Sophie > À bientôt.");
    rl.close();
  };

  const prompt = (): void => {
    rl.question("You > ", async (line) => {
      const text = line.trim();
      if (!text) {
        prompt();
        return;
      }
      if (/^(exit|quit|q)$/i.test(text)) {
        shutdown();
        return;
      }
      try {
        const result = await runtime.processInput(text);
        console.log(`Sophie > ${formatter.formatCli(result.response)}`);
        if (showTiming) {
          console.log(formatTiming(result.timing));
        }
        if (showTrace && result.trace) {
          console.log(formatPipelineTrace(result.trace));
        }
        if (showMetrics) {
          console.log(runtime.formatMetrics());
        }
        console.log("");
      } catch (err) {
        // Recover stuck mid-flight states if something escaped processInput
        if (
          runtime.getState() === "UNDERSTANDING" ||
          runtime.getState() === "PLANNING" ||
          runtime.getState() === "EXECUTING"
        ) {
          // processInput finally should already reset; defensive only
        }
        const message = err instanceof Error ? err.message : String(err);
        console.log(`Sophie > Une erreur est survenue. (${message.slice(0, 120)})`);
        console.log("");
      }
      prompt();
    });
  };

  prompt();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
