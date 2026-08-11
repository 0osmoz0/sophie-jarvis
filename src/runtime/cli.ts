/**
 * JARVIS interactive CLI — orchestrates Runtime only.
 * No shell spawning, no direct system mutation.
 */
import * as readline from "node:readline";
import { PermissionManager } from "../permissions/PermissionManager.js";
import { FileService } from "../files/FileService.js";
import { MemoryFileAuditLog } from "../files/FileAuditLog.js";
import {
  ApplicationRegistry,
  ApplicationService,
  MemoryApplicationAuditLog,
} from "../applications/index.js";
import { ObservationService } from "../observation/ObservationService.js";
import { ScreenService } from "../screen/ScreenService.js";
import { UserActivityService } from "../presence/UserActivityService.js";
import { ContextService } from "../context/ContextService.js";
import { ActionService } from "../actions/ActionService.js";
import { ActionConfirmation } from "../actions/ActionConfirmation.js";
import { IntentRouter } from "../ai/IntentRouter.js";
import { OllamaLLMProvider } from "../ai/OllamaLLMProvider.js";
import { MockLLMProvider } from "../ai/MockLLMProvider.js";
import { formatLLMHealth, probeLLMHealth } from "../ai/LLMHealth.js";
import { JarvisRuntime, formatTiming } from "./JarvisRuntime.js";
import { ResponseFormatter } from "./ResponseFormatter.js";

function banner(): void {
  console.log(`
╭──────────────────────────────╮
│        J.A.R.V.I.S.          │
│        Local Assistant        │
╰──────────────────────────────╯
`);
}

function createProductionRuntime(): JarvisRuntime {
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
  const apps = new ApplicationService({
    registry: appRegistry,
    audit: new MemoryApplicationAuditLog(),
  });
  const permissions = new PermissionManager();
  const actions = new ActionService({
    files,
    applications: apps,
    permissions,
    confirmation: new ActionConfirmation(),
  });
  const router = new IntentRouter({ provider, actions });
  const contextService = new ContextService({
    observation: new ObservationService(),
    applications: apps,
    screen: new ScreenService(),
    activity: new UserActivityService(),
  });
  return new JarvisRuntime({
    router,
    actions,
    contextService,
    formatter: new ResponseFormatter(),
  });
}

async function main(): Promise<void> {
  banner();

  if (process.argv.includes("--health")) {
    const report = await probeLLMHealth();
    console.log(formatLLMHealth(report));
    console.log("");
    return;
  }

  const runtime = createProductionRuntime();
  const formatter = new ResponseFormatter();
  const showTiming = process.argv.includes("--timing");

  console.log("JARVIS ready.");
  if (process.env.JARVIS_LLM_PROVIDER === "mock") {
    console.log("(LLM provider: mock — tests/dev only)");
  }
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): void => {
    rl.question("You > ", async (line) => {
      const text = line.trim();
      if (!text) {
        prompt();
        return;
      }
      if (/^(exit|quit|q)$/i.test(text)) {
        console.log("Sophie > À bientôt.");
        rl.close();
        return;
      }
      try {
        const result = await runtime.processInput(text);
        console.log(`Sophie > ${formatter.formatCli(result.response)}`);
        if (showTiming) {
          console.log(formatTiming(result.timing));
        }
        console.log("");
      } catch (err) {
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
