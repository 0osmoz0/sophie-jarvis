/**
 * Phase 12 — Sophie integration contract tests.
 * Ensures Sophie cannot bypass Risk / Permission / Confirmation / Executor.
 */
import { PermissionManager } from "../src/permissions/PermissionManager.js";
import { FileService } from "../src/files/FileService.js";
import { MemoryFileAuditLog } from "../src/files/FileAuditLog.js";
import {
  ApplicationRegistry,
  MockApplicationService,
  MemoryApplicationAuditLog,
} from "../src/applications/index.js";
import { ActionService } from "../src/actions/ActionService.js";
import { MemoryActionAuditLog } from "../src/actions/ActionAuditLog.js";
import {
  SophieAPI,
  SophieIntegration,
} from "../src/integration/index.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

export interface ContractTestReport {
  ok: boolean;
  failures: string[];
  notes: string[];
}

function createHarness() {
  const audit = new MemoryActionAuditLog();
  const files = new FileService({ audit: new MemoryFileAuditLog() });
  const apps = new MockApplicationService({
    registry: new ApplicationRegistry(),
    audit: new MemoryApplicationAuditLog(),
  });
  const actions = new ActionService({
    files,
    applications: apps,
    permissions: new PermissionManager(),
    audit,
  });
  const integration = new SophieIntegration();
  const api = new SophieAPI(integration);
  return { api, integration, actions, audit };
}

export async function runIntegrationContractTests(): Promise<ContractTestReport> {
  const failures: string[] = [];
  const notes: string[] = [];

  // Test 1 — pet updates memory/context
  {
    const { api, integration } = createHarness();
    const r = api.emit({ type: "pet" });
    if (!r.ok) failures.push("Test1: pet rejected");
    if (integration.memory.lastSophieInteraction?.type !== "pet") {
      failures.push("Test1: memory not updated");
    }
  }

  // Test 2 — execute file.delete rejected
  {
    const { api } = createHarness();
    const r = api.emit({ type: "execute file.delete" });
    if (r.ok) failures.push("Test2: execute file.delete accepted");
  }

  // Test 3 — shell rejected
  {
    const { api } = createHarness();
    const r = api.emit({ type: "shell", payload: { command: "rm -rf /" } });
    if (r.ok) failures.push("Test3: shell accepted");
    const r2 = api.emit({
      type: "external_activity",
      payload: { shell: "rm -rf /" },
    });
    if (r2.ok) failures.push("Test3: shell payload key accepted");
  }

  // Test 4 — stateOverride rejected
  {
    const { api } = createHarness();
    const r = api.emit({ type: "stateOverride", payload: { state: "GOD" } });
    if (r.ok) failures.push("Test4: stateOverride accepted");
    const r2 = api.emit({
      type: "pet",
      stateOverride: "GOD",
    } as unknown);
    if (r2.ok) failures.push("Test4: top-level stateOverride accepted");
  }

  // Test 5 — animationOverride rejected
  {
    const { api } = createHarness();
    const r = api.emit({
      type: "pet",
      payload: { animationOverride: "dance" },
    });
    if (r.ok) failures.push("Test5: animationOverride accepted");
  }

  // Test 6 — external event never bypasses Risk/Permission/Confirmation
  {
    const { api, actions, audit } = createHarness();
    const before = audit.list().length;
    api.emit({ type: "pet" });
    api.emit({ type: "music_started" });
    // No plan/execute should appear
    const after = audit.list().length;
    if (after !== before) {
      failures.push("Test6: action audit grew from Sophie signals");
    }
    // SophieAPI must not expose execute
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(api));
    if (proto.includes("execute") || proto.includes("runCommand") || proto.includes("shell")) {
      failures.push("Test6: SophieAPI exposes control methods");
    }
    void actions;
  }

  // Test 7 — music_started no direct action
  {
    const { api, audit } = createHarness();
    const before = audit.list().length;
    api.emit({ type: "music_started" });
    if (audit.list().length !== before) {
      failures.push("Test7: music_started triggered action audit");
    }
  }

  // Test 8 — user_idle no direct action
  {
    const { api, audit } = createHarness();
    const before = audit.list().length;
    api.emit({ type: "user_idle" });
    if (audit.list().length !== before) {
      failures.push("Test8: user_idle triggered action audit");
    }
  }

  // Test 9 — external_activity no direct action
  {
    const { api, audit } = createHarness();
    const before = audit.list().length;
    api.emit({ type: "external_activity", payload: { source: "mail" } });
    if (audit.list().length !== before) {
      failures.push("Test9: external_activity triggered action audit");
    }
  }

  notes.push("Contract: Sophie signals update memory/context only.");
  notes.push("No Sophie → Executor path.");

  return { ok: failures.length === 0, failures, notes };
}

const isDirect =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  runIntegrationContractTests().then((report) => {
    for (const n of report.notes) console.log(`  note: ${n}`);
    if (report.ok) console.log("Integration contract tests PASSED.");
    else {
      console.error("Integration contract tests FAILED:");
      for (const f of report.failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  });
}
