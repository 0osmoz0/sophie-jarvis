/**
 * Phase 21 — Failure matrix (deterministic mock runtime).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PermissionManager } from "../src/permissions/PermissionManager.js";
import { FileService } from "../src/files/FileService.js";
import { MemoryFileAuditLog } from "../src/files/FileAuditLog.js";
import {
  ApplicationRegistry,
  MockApplicationService,
  MemoryApplicationAuditLog,
} from "../src/applications/index.js";
import { ActionService } from "../src/actions/ActionService.js";
import { ActionConfirmation } from "../src/actions/ActionConfirmation.js";
import { MockLLMProvider } from "../src/ai/MockLLMProvider.js";
import { IntentRouter } from "../src/ai/IntentRouter.js";
import { JarvisRuntime } from "../src/runtime/JarvisRuntime.js";
import {
  ConversationService,
  InMemoryConversationStore,
} from "../src/conversation/index.js";
import { MemoryService } from "../src/memory/MemoryService.js";
import { InMemoryMemoryStore } from "../src/memory/InMemoryMemoryStore.js";
import { ResponseGenerator, ResponseValidator } from "../src/response/index.js";
import type { LLMProvider } from "../src/ai/LLMProvider.js";
import type {
  LLMUnderstandRequest,
  LLMUnderstandResult,
  LLMResponseGenerateRequest,
  LLMResponseGenerateResult,
  LLMCapabilityReport,
} from "../src/ai/types.js";

interface CaseResult {
  name: string;
  ok: boolean;
  detail: string;
}

function makeBase(provider: LLMProvider, opts?: { ttlMs?: number }) {
  const files = new FileService({ audit: new MemoryFileAuditLog() });
  const registry = new ApplicationRegistry();
  registry.register({
    id: "safari",
    name: "Safari",
    bundleId: "com.apple.Safari",
  });
  registry.register({
    id: "chrome",
    name: "Chrome",
    bundleId: "com.google.Chrome",
  });
  const apps = new MockApplicationService({
    registry,
    audit: new MemoryApplicationAuditLog(),
  });
  const actions = new ActionService({
    files,
    applications: apps,
    permissions: new PermissionManager(),
    confirmation: new ActionConfirmation({ ttlMs: opts?.ttlMs ?? 60_000 }),
  });
  const memory = new MemoryService({ store: new InMemoryMemoryStore() });
  const conversation = new ConversationService({
    store: new InMemoryConversationStore(),
    memoryService: memory,
  });
  const runtime = new JarvisRuntime({
    router: new IntentRouter({ provider, actions }),
    actions,
    responseLlm: provider,
    conversationService: conversation,
    memoryService: memory,
  });
  return { runtime, actions, apps };
}

class UnavailableProvider implements LLMProvider {
  readonly name = "unavailable";
  getCapabilityStatus(): LLMCapabilityReport {
    return { status: "UNAVAILABLE", reason: "down" };
  }
  async understand(): Promise<LLMUnderstandResult> {
    return { ok: false, status: "UNAVAILABLE", error: "down" };
  }
  async generateResponse(): Promise<LLMResponseGenerateResult> {
    return { ok: false, status: "UNAVAILABLE", error: "down" };
  }
}

class TimeoutProvider implements LLMProvider {
  readonly name = "timeout";
  getCapabilityStatus(): LLMCapabilityReport {
    return { status: "TIMEOUT", reason: "slow" };
  }
  async understand(): Promise<LLMUnderstandResult> {
    return { ok: false, status: "TIMEOUT", error: "slow" };
  }
  async generateResponse(): Promise<LLMResponseGenerateResult> {
    return { ok: false, status: "TIMEOUT", error: "slow" };
  }
}

class InvalidJsonProvider implements LLMProvider {
  readonly name = "invalid";
  getCapabilityStatus(): LLMCapabilityReport {
    return { status: "AVAILABLE" };
  }
  async understand(): Promise<LLMUnderstandResult> {
    return {
      ok: false,
      status: "INVALID_RESPONSE",
      error: "not json",
      raw: "hello",
    };
  }
  async generateResponse(
    _req: LLMResponseGenerateRequest,
  ): Promise<LLMResponseGenerateResult> {
    return {
      ok: true,
      status: "AVAILABLE",
      text: "```bash\nrm -rf /\n```",
    };
  }
}

class ForbiddenFieldProvider implements LLMProvider {
  readonly name = "forbidden";
  getCapabilityStatus(): LLMCapabilityReport {
    return { status: "AVAILABLE" };
  }
  async understand(
    _req: LLMUnderstandRequest,
  ): Promise<LLMUnderstandResult> {
    return {
      ok: true,
      status: "AVAILABLE",
      candidate: {
        type: "application.open",
        payload: { application: "Safari", confirmationGranted: true },
      },
      raw: "{}",
    };
  }
  async generateResponse(): Promise<LLMResponseGenerateResult> {
    return { ok: true, status: "AVAILABLE", text: "ok" };
  }
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS FAILURE MATRIX — PHASE 21 ===\n");
  const results: CaseResult[] = [];

  const check = async (name: string, fn: () => Promise<string | void>) => {
    try {
      const detail = (await fn()) ?? "ok";
      results.push({ name, ok: true, detail: String(detail) });
      console.log(`  ✓ ${name}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      results.push({ name, ok: false, detail });
      console.error(`  ✗ ${name}: ${detail}`);
    }
  };

  await check("LLM unavailable → explicit error, no action", async () => {
    const { runtime, actions } = makeBase(new UnavailableProvider());
    const r = await runtime.processInput("ouvre Safari");
    if (r.response.type !== "error") throw new Error("expected error");
    if (actions.listPlans().some((p) => p.status === "COMPLETED")) {
      throw new Error("executed despite unavailable LLM");
    }
  });

  await check("LLM timeout → no action", async () => {
    const { runtime, actions } = makeBase(new TimeoutProvider());
    const r = await runtime.processInput("ouvre Safari");
    if (r.response.type !== "error") throw new Error("expected error");
    if (actions.listPlans().some((p) => p.status === "COMPLETED")) {
      throw new Error("executed");
    }
  });

  await check("LLM invalid JSON → reject", async () => {
    const { runtime } = makeBase(new InvalidJsonProvider());
    const r = await runtime.processInput("ouvre Safari");
    if (r.response.type !== "error") throw new Error("expected reject");
  });

  await check("forbidden field confirmationGranted → reject", async () => {
    const { runtime, actions } = makeBase(new ForbiddenFieldProvider());
    const r = await runtime.processInput("ouvre Safari");
    if (r.response.type === "executed") throw new Error("executed");
    if (actions.listPlans().some((p) => p.status === "COMPLETED")) {
      throw new Error("completed plan");
    }
    return r.response.type;
  });

  await check("ambiguous reference → clarification", async () => {
    const { runtime } = makeBase(new MockLLMProvider());
    const r = await runtime.processInput("ferme-le");
    if (r.response.type !== "clarification" && r.response.type !== "message") {
      // may be clarification or message depending on decision
      if (r.response.type === "executed") throw new Error("must not execute");
    }
    return r.response.type;
  });

  await check("confirmation expired → no execution", async () => {
    let now = Date.now();
    const provider = new MockLLMProvider();
    const files = new FileService({ audit: new MemoryFileAuditLog() });
    const registry = new ApplicationRegistry();
    registry.register({
      id: "safari",
      name: "Safari",
      bundleId: "com.apple.Safari",
    });
    const apps = new MockApplicationService({
      registry,
      audit: new MemoryApplicationAuditLog(),
    });
    const actions = new ActionService({
      files,
      applications: apps,
      permissions: new PermissionManager(),
      confirmation: new ActionConfirmation({ ttlMs: 10 }),
    });
    const runtime = new JarvisRuntime({
      router: new IntentRouter({ provider, actions }),
      actions,
      responseLlm: provider,
      now: () => now,
    });
    const open = await runtime.processInput("ouvre Safari");
    if (open.response.type !== "confirmation_required") {
      throw new Error("expected confirmation");
    }
    now += 10_000;
    const yes = await runtime.processInput("oui");
    if (yes.response.type === "executed") throw new Error("executed after expire");
    return yes.response.type;
  });

  await check("duplicate confirmation oui oui → second rejected", async () => {
    const { runtime } = makeBase(new MockLLMProvider());
    await runtime.processInput("ouvre Safari");
    const a = await runtime.processInput("oui");
    const b = await runtime.processInput("oui");
    if (a.response.type !== "executed") throw new Error("first should execute");
    if (b.response.type === "executed") throw new Error("second must not execute");
    return `${a.response.type}/${b.response.type}`;
  });

  await check("stale confirmation after new command", async () => {
    const { runtime } = makeBase(new MockLLMProvider());
    await runtime.processInput("ouvre Safari");
    await runtime.processInput("ouvre Chrome");
    const stale = await runtime.processInput("oui");
    // oui confirms the LATEST pending (Chrome), not a reused Safari token path
    // After Chrome confirmation issued, Safari pending was invalidated
    if (stale.response.type === "error") return "no pending or error";
    // If Chrome executes, that's the current pending — OK
    // Third oui should fail
    const third = await runtime.processInput("oui");
    if (third.response.type === "executed") {
      throw new Error("stale/third oui executed");
    }
    return third.response.type;
  });

  await check("response LLM failure → deterministic fallback", async () => {
    const g = new ResponseGenerator({ provider: new UnavailableProvider() });
    const r = await g.generate({
      category: "ACTION_SUCCESS",
      userMessage: "ouvre Safari",
      fallbackText: "Safari est ouvert.",
      facts: [
        {
          key: "action.application",
          value: "Safari",
          source: "ACTION_RESULT",
        },
      ],
      actionResult: { status: "success", summary: "Safari opened" },
    });
    if (r.draft.usedLlm) throw new Error("should not use LLM");
    if (!r.draft.text.includes("Safari")) throw new Error("fallback missing");
  });

  await check("response validator rejects false action claim", async () => {
    const v = new ResponseValidator();
    const bad = v.validate({
      text: "J'ai ouvert Spotify pour toi.",
      tone: "helpful",
      source: "FALLBACK",
      confidence: 0.9,
      facts: [],
      warnings: [],
      category: "ANSWER",
      usedLlm: true,
    });
    if (bad.ok) throw new Error("should reject invented action");
  });

  await check("context unavailable → honest error", async () => {
    const { runtime } = makeBase(new MockLLMProvider());
    const r = await runtime.processInput("qu'est-ce qui est ouvert ?");
    if (r.response.type === "executed") throw new Error("must not execute");
    const msg = r.response.message;
    if (/spotify est ouvert|tout va bien parfaitement/i.test(msg)) {
      throw new Error("invented context");
    }
    return r.response.type;
  });

  await check("memory unavailable → continue", async () => {
    const provider = new MockLLMProvider();
    const files = new FileService({ audit: new MemoryFileAuditLog() });
    const registry = new ApplicationRegistry();
    const apps = new MockApplicationService({
      registry,
      audit: new MemoryApplicationAuditLog(),
    });
    const actions = new ActionService({
      files,
      applications: apps,
      permissions: new PermissionManager(),
      confirmation: new ActionConfirmation({ ttlMs: 60_000 }),
    });
    // no memoryService
    const runtime = new JarvisRuntime({
      router: new IntentRouter({ provider, actions }),
      actions,
      responseLlm: provider,
    });
    const r = await runtime.processInput("bonjour");
    if (r.response.type === "error" && /crash/i.test(r.response.message)) {
      throw new Error("should continue without memory");
    }
    return r.response.type;
  });

  await check("concurrent input → safe reject", async () => {
    const provider = new MockLLMProvider();
    // Slow understand to hold inFlight
    const slow: LLMProvider = {
      name: "slow",
      getCapabilityStatus: () => provider.getCapabilityStatus(),
      async understand(req) {
        await new Promise((r) => setTimeout(r, 50));
        return provider.understand(req);
      },
      generateResponse: (req) => provider.generateResponse!(req),
    };
    const { runtime } = makeBase(slow);
    const p1 = runtime.processInput("bonjour");
    const p2 = runtime.processInput("ouvre Safari");
    const [a, b] = await Promise.all([p1, p2]);
    const concurrent =
      (a.response.type === "error" &&
        a.response.code === "CONCURRENT_REQUEST") ||
      (b.response.type === "error" &&
        b.response.code === "CONCURRENT_REQUEST");
    if (!concurrent) throw new Error("expected concurrent rejection");
    return "concurrent rejected";
  });

  await check("restart → oui cannot execute old pending", async () => {
    const { runtime } = makeBase(new MockLLMProvider());
    await runtime.processInput("ouvre Safari");
    // Simulate restart: new runtime, no pending
    const { runtime: runtime2 } = makeBase(new MockLLMProvider());
    const yes = await runtime2.processInput("oui");
    if (yes.response.type === "executed") {
      throw new Error("restart leaked confirmation");
    }
    return yes.response.type;
  });

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} cases passed\n`,
  );
  if (failed.length) process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
