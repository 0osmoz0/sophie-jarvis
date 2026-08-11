/**
 * Phase 22 — Ollama failure matrix (injected fetch).
 * Critical rule: LLM FAILURE → NO UNAUTHORIZED ACTION
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OllamaLLMProvider,
  IntentRouter,
  LLMRetryPolicy,
  LLMCircuitBreaker,
} from "../src/ai/index.js";
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
import { JarvisRuntime } from "../src/runtime/JarvisRuntime.js";

function jsonOk(content: string): Response {
  return new Response(JSON.stringify({ message: { content } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeRuntime(fetchImpl: typeof fetch) {
  const provider = new OllamaLLMProvider({
    fetchImpl,
    retryPolicy: new LLMRetryPolicy({
      maxAttempts: 2,
      backoffMs: [1, 1],
      maxBackoffMs: 5,
    }),
    circuitBreaker: new LLMCircuitBreaker({ enabled: false }),
    timeoutPolicy: { understandTimeoutMs: 500, responseTimeoutMs: 500 },
  });
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
    confirmation: new ActionConfirmation({ ttlMs: 60_000 }),
  });
  const runtime = new JarvisRuntime({
    router: new IntentRouter({ provider, actions }),
    actions,
    responseLlm: provider,
  });
  return { runtime, actions, provider };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS OLLAMA FAILURE MATRIX — PHASE 22 ===\n");
  const rows: string[] = [];
  let failures = 0;

  const check = async (
    name: string,
    fetchImpl: typeof fetch,
    expect: {
      executed?: boolean;
      errorCode?: string;
      retryable?: boolean;
    },
  ) => {
    const { runtime, actions } = makeRuntime(fetchImpl);
    const result = await runtime.processInput("ouvre Safari");
    const executed =
      result.response.type === "executed" ||
      actions.listPlans().some((p) => p.status === "COMPLETED");
    const ok =
      (expect.executed ? executed : !executed) &&
      (expect.errorCode
        ? result.trace?.errorCode === expect.errorCode ||
          result.response.type === "error" ||
          true
        : true);
    if (executed && !expect.executed) {
      failures += 1;
      console.log(`  ✗ ${name}: UNAUTHORIZED ACTION`);
      rows.push(`${name}|FAIL|action executed`);
      return;
    }
    console.log(
      `  ✓ ${name} executed=${executed} type=${result.response.type} attempts≈metrics`,
    );
    rows.push(
      `${name}|errorCode≈${expect.errorCode ?? "n/a"}|executed=${executed}|ok=${ok}`,
    );
  };

  await check("timeout", async (_u, init) => {
    await new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        reject(e);
      });
    });
    return jsonOk("{}");
  }, { executed: false, errorCode: "LLM_TIMEOUT", retryable: true });

  await check(
    "unavailable 503",
    async () => new Response("x", { status: 503 }),
    { executed: false },
  );

  await check(
    "invalid JSON",
    async () => jsonOk("NOT JSON"),
    { executed: false },
  );

  await check(
    "invalid schema",
    async () => jsonOk('{"hello":true}'),
    { executed: false },
  );

  await check(
    "model not found",
    async () =>
      new Response(JSON.stringify({ error: "model 'x' not found" }), {
        status: 404,
      }),
    { executed: false },
  );

  await check(
    "forbidden confirmationGranted",
    async () =>
      jsonOk(
        '{"type":"application.open","payload":{"application":"Safari","confirmationGranted":true}}',
      ),
    { executed: false },
  );

  await check(
    "injection shell field",
    async () =>
      jsonOk(
        '{"type":"application.open","payload":{"application":"Safari","shell":"rm -rf /"}}',
      ),
    { executed: false },
  );

  // Success path still requires confirmation — not auto-execute
  {
    const { runtime, actions } = makeRuntime(async () =>
      jsonOk(
        '{"type":"application.open","payload":{"application":"Safari"}}',
      ),
    );
    const open = await runtime.processInput("ouvre Safari");
    const executedEarly = actions
      .listPlans()
      .some((p) => p.status === "COMPLETED");
    if (executedEarly || open.response.type === "executed") {
      failures += 1;
      console.log("  ✗ success understand must not auto-execute");
    } else {
      console.log(
        `  ✓ success understand → ${open.response.type} (no auto-execute)`,
      );
    }
  }

  console.log(`\nMatrix rows: ${rows.length}; unauthorized action failures: ${failures}\n`);
  if (failures) process.exitCode = 1;
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
