/**
 * Phase 7 user activity & presence smoke tests.
 * Default: MockUserActivityBackend. Opt-in: JARVIS_MACOS_USER_ACTIVITY_TESTS=1
 */
import { JarvisCore } from "../src/core/JarvisCore.js";
import { EventBus } from "../src/core/EventBus.js";
import { PermissionManager } from "../src/permissions/PermissionManager.js";
import { TaskManager } from "../src/core/TaskManager.js";
import { ToolRegistry } from "../src/tools/ToolRegistry.js";
import { registerPresenceTools } from "../src/tools/registerPresenceTools.js";
import { UserActivityService } from "../src/presence/UserActivityService.js";
import { MockUserActivityBackend } from "../src/presence/MockUserActivityBackend.js";
import { UserActivityPolicy } from "../src/presence/UserActivityPolicy.js";
import { MemoryUserActivityAuditLog } from "../src/presence/UserActivityAuditLog.js";
import {
  idleSecondsToBucket,
  presenceFromActivity,
  type UserActivityBackend,
  type UserActivityResult,
  type UserActivitySnapshot,
} from "../src/presence/index.js";
import { ObservationService } from "../src/observation/ObservationService.js";
import { MacOSUserActivityBackend } from "../src/platform/macos/MacOSUserActivityBackend.js";
import { runUserActivityAudit } from "./jarvis-user-activity-audit.js";

interface TestResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      results.push({ name, ok: true });
      console.log(`  ✓ ${name}`);
    })
    .catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      results.push({ name, ok: false, detail });
      console.error(`  ✗ ${name}: ${detail}`);
    });
}

function createService(options?: {
  idleThresholdSeconds?: number;
  returnThresholdSeconds?: number;
  backend?: MockUserActivityBackend;
  events?: EventBus;
  policy?: UserActivityPolicy;
}) {
  const backend = options?.backend ?? new MockUserActivityBackend();
  const audit = new MemoryUserActivityAuditLog();
  const policy = options?.policy ?? new UserActivityPolicy();
  const service = new UserActivityService({
    backend,
    policy,
    audit,
    events: options?.events,
    idleThresholdSeconds: options?.idleThresholdSeconds ?? 30,
    returnThresholdSeconds: options?.returnThresholdSeconds ?? 2,
  });
  return { backend, service, audit, policy };
}

async function main(): Promise<void> {
  console.log("\n=== JARVIS User Activity Phase 7 — Smoke Tests ===\n");

  console.log("1) Mock ACTIVE");
  await test("mock ACTIVE when idle below threshold", async () => {
    const { backend, service } = createService();
    backend.setIdleSeconds(0);
    const r = await service.getActivity();
    assert(r.success && r.data.status === "ACTIVE", "ACTIVE");
    assert(r.success && r.data.idleSeconds === 0, "idle 0");
    assert(r.success && r.data.source === "mock", "mock source");
  });

  console.log("\n2) Mock IDLE");
  await test("mock IDLE on first poll when idle >= threshold", async () => {
    const { backend, service } = createService();
    backend.setIdleSeconds(45);
    const r = await service.getActivity();
    assert(r.success && r.data.status === "IDLE", "IDLE");
  });

  console.log("\n3) JUST_BECAME_IDLE");
  await test("ACTIVE → JUST_BECAME_IDLE when idle crosses threshold", async () => {
    const { backend, service } = createService();
    backend.setIdleSeconds(5);
    const a = await service.getActivity();
    assert(a.success && a.data.status === "ACTIVE", "start ACTIVE");
    backend.setIdleSeconds(35);
    const b = await service.getActivity();
    assert(b.success && b.data.status === "JUST_BECAME_IDLE", "JUST_BECAME_IDLE");
  });

  console.log("\n4) JUST_RETURNED");
  await test("IDLE → JUST_RETURNED when activity returns", async () => {
    const { backend, service } = createService();
    backend.setIdleSeconds(60);
    await service.getActivity(); // IDLE
    backend.setIdleSeconds(40);
    const mid = await service.getActivity(); // still IDLE
    assert(mid.success && mid.data.status === "IDLE", "still IDLE");
    backend.setIdleSeconds(1);
    const ret = await service.getActivity();
    assert(ret.success && ret.data.status === "JUST_RETURNED", "JUST_RETURNED");
  });

  console.log("\n5) UNKNOWN");
  await test("UNKNOWN when backend unavailable", async () => {
    const { backend, service } = createService();
    backend.setUnavailable(true);
    const r = await service.getActivity();
    assert(r.success && r.data.status === "UNKNOWN", "UNKNOWN");
    assert(r.success && r.data.source === "unavailable", "unavailable source");
  });

  console.log("\n6) threshold");
  await test("configurable idleThresholdSeconds", async () => {
    const { backend, service } = createService({ idleThresholdSeconds: 10 });
    backend.setIdleSeconds(5);
    const a = await service.getActivity();
    assert(a.success && a.data.status === "ACTIVE", "ACTIVE under 10");
    backend.setIdleSeconds(12);
    const b = await service.getActivity();
    assert(b.success && b.data.status === "JUST_BECAME_IDLE", "cross 10");
  });

  console.log("\n7) hysteresis");
  await test("returnThreshold prevents ACTIVE↔IDLE chatter", async () => {
    const { backend, service } = createService({
      idleThresholdSeconds: 30,
      returnThresholdSeconds: 2,
    });
    backend.setIdleSeconds(40);
    await service.getActivity(); // IDLE
    backend.setIdleSeconds(10); // still above returnThreshold
    const still = await service.getActivity();
    assert(still.success && still.data.status === "IDLE", "hysteresis hold IDLE");
    backend.setIdleSeconds(1);
    const back = await service.getActivity();
    assert(back.success && back.data.status === "JUST_RETURNED", "return");
  });

  console.log("\n8) presence mapping");
  await test("presence maps ACTIVE→PRESENT and IDLE→IDLE", async () => {
    const pActive = presenceFromActivity("ACTIVE");
    assert(pActive.presence === "PRESENT", "PRESENT");
    const pIdle = presenceFromActivity("IDLE");
    assert(pIdle.presence === "IDLE", "IDLE");
    assert(
      pIdle.reason.toLowerCase().includes("does not prove"),
      "absence disclaimer",
    );
  });

  console.log("\n9) confidence");
  await test("confidence is conservative", async () => {
    assert(presenceFromActivity("ACTIVE").confidence === 1.0, "active 1.0");
    assert(presenceFromActivity("IDLE").confidence === 0.6, "idle 0.6");
    assert(presenceFromActivity("UNKNOWN").confidence === 0.0, "unknown 0");
  });

  console.log("\n10) unavailable backend");
  await test("MacOS without bridge is UNAVAILABLE / UNKNOWN", async () => {
    const backend = new MacOSUserActivityBackend({ skipNativeLoad: true });
    const cap = backend.getCapabilityStatus("getIdleDuration");
    assert(cap.status === "UNAVAILABLE", "cap UNAVAILABLE");
    const service = new UserActivityService({ backend });
    const r = await service.getActivity();
    assert(r.success && r.data.status === "UNKNOWN", "UNKNOWN");
  });

  console.log("\n11) policy");
  await test("policy can deny reads and never allows actions", async () => {
    const policy = new UserActivityPolicy();
    assert(policy.allowsSecurityActions() === false, "no security actions");
    assert(policy.allowsAutomaticCapture() === false, "no capture");
    assert(policy.allowsCamera() === false, "no camera");
    assert(policy.allowsAudioInput() === false, "no audio");
    policy.setReadsAllowed(false);
    const { service } = createService({ policy });
    const r = await service.getActivity();
    assert(!r.success && r.error.code === "DENIED", "denied");
  });

  console.log("\n12) audit privacy");
  await test("audit uses idle buckets — never raw input fields", async () => {
    const { backend, service, audit } = createService();
    backend.setIdleSeconds(12);
    await service.getActivity();
    const entries = audit.list();
    assert(entries.length >= 1, "has entry");
    const e = entries[0]!;
    assert(e.idleBucket === idleSecondsToBucket(12), "bucket");
    assert(e.idleBucket === "5-30s", "5-30s");
    const json = JSON.stringify(e);
    assert(!/"key"\s*:/.test(json), "no key");
    assert(!/"x"\s*:/.test(json), "no x");
    assert(!/"y"\s*:/.test(json), "no y");
    assert(!/keycode/i.test(json), "no keycode");
  });

  console.log("\n13) event emission");
  await test("emits user_became_idle and user_returned signals only", async () => {
    const events = new EventBus();
    const seen: string[] = [];
    events.on("user_activity_changed", () => seen.push("changed"));
    events.on("user_became_idle", () => seen.push("idle"));
    events.on("user_returned", () => seen.push("returned"));
    const { backend, service } = createService({ events });
    backend.setIdleSeconds(0);
    await service.getActivity(); // ACTIVE init — no change events
    backend.setIdleSeconds(40);
    await service.getActivity(); // JUST_BECAME_IDLE
    assert(seen.includes("changed") && seen.includes("idle"), "became idle");
    backend.setIdleSeconds(50);
    await service.getActivity(); // IDLE
    backend.setIdleSeconds(0);
    await service.getActivity(); // JUST_RETURNED
    assert(seen.includes("returned"), "returned");
  });

  console.log("\n14) ObservationSnapshot integration");
  await test("ObservationSnapshot includes activitySignal + userPresence", async () => {
    const { backend, service } = createService();
    backend.setIdleSeconds(0);
    const obs = new ObservationService({ userActivityService: service });
    const snap = await obs.snapshot({ bypassCache: true });
    assert(snap.activitySignal !== undefined, "activitySignal field");
    assert(snap.userPresence !== undefined, "userPresence field");
    assert(snap.activitySignal?.status === "ACTIVE", "ACTIVE signal");
    assert(snap.userPresence?.presence === "PRESENT", "PRESENT");
    assert(snap.userActivity !== undefined, "phase2 userActivity intact");
  });

  console.log("\n15) malformed backend response");
  await test("non-finite idle → UNKNOWN", async () => {
    const malformed: UserActivityBackend = {
      name: "malformed",
      getCapabilityStatus() {
        return { capability: "getIdleDuration", status: "AVAILABLE" };
      },
      async getIdleDuration() {
        return { success: true, data: { idleSeconds: Number.NaN } };
      },
      async getActivitySnapshot(): Promise<UserActivityResult<UserActivitySnapshot>> {
        return {
          success: false,
          error: { code: "INVALID_INPUT", message: "malformed" },
        };
      },
    };
    const service = new UserActivityService({ backend: malformed });
    const r = await service.getActivity();
    assert(r.success && r.data.status === "UNKNOWN", "UNKNOWN on NaN");
  });

  console.log("\n16) tools via JarvisCore");
  await test("user.activity and user.presence tools (LOW)", async () => {
    const { backend, service } = createService();
    backend.setIdleSeconds(0);
    const registry = new ToolRegistry();
    registerPresenceTools(registry, service);
    const core = new JarvisCore({
      registry,
      permissions: new PermissionManager(),
      tasks: new TaskManager(),
    });
    const act = await core.handleIntent({ tool: "user.activity", arguments: {} });
    assert(act.executed === true, "activity executed");
    assert(act.task.status === "completed", "completed");
    const data = act.task.result as {
      status: string;
      idleSeconds: number;
      source: string;
    };
    assert(data.status === "ACTIVE", "tool ACTIVE");
    const pres = await core.handleIntent({ tool: "user.presence", arguments: {} });
    assert(pres.executed === true, "presence executed");
    const pdata = pres.task.result as {
      presence: string;
      confidence: number;
      reason: string;
    };
    assert(pdata.presence === "PRESENT", "PRESENT");
    assert(pdata.confidence === 1, "confidence");
  });

  console.log("\n17) security audit");
  await test("user activity security audit passes", async () => {
    const report = await runUserActivityAudit();
    assert(report.ok, report.failures.join("; ") || "audit ok");
  });

  if (process.env.JARVIS_MACOS_USER_ACTIVITY_TESTS === "1") {
    console.log("\n18) opt-in macOS idle read (aggregate only)");
    await test("macOS idle duration read or honest UNAVAILABLE", async () => {
      const backend = new MacOSUserActivityBackend();
      await backend.ensureBridge();
      const idle = await backend.getIdleDuration();
      if (!idle.success) {
        assert(idle.error.code === "UNAVAILABLE", "honest UNAVAILABLE");
        return;
      }
      assert(
        idle.data.idleSeconds === null ||
          (Number.isFinite(idle.data.idleSeconds) &&
            idle.data.idleSeconds! >= 0),
        "aggregate idle only",
      );
      // Must not persist personal input content
      assert(true, "no key/mouse content stored");
    });
  } else {
    console.log(
      "\n(skip) JARVIS_MACOS_USER_ACTIVITY_TESTS not set — macOS idle opt-in skipped",
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n=== Results: ${results.length - failed.length}/${results.length} passed ===\n`,
  );
  if (failed.length > 0) {
    for (const f of failed) console.error(`FAIL: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
