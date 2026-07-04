import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  approveSpecGraph,
  createBulkTaggingSpec,
  recordAction,
  stableStringify,
  validateSpecGraph
} from "../src/draftkit/index.js";
import {
  draftCancel,
  draftImplementToLive,
  draftOpen,
  draftPlanToGoLive,
  draftPreviewPath,
  draftStatus,
  validateDraftkitState
} from "../scripts/draftkit-session.mjs";

test("state schema validation accepts a complete active draft state", () => {
  const state = activeState({ cwd: "/tmp/draftkit-root" });

  const validation = validateDraftkitState(state);

  assert.equal(validation.valid, true, validation.errors.join("; "));
});

test("state schema validation rejects missing fields and unsupported states", () => {
  const missing = validateDraftkitState({ mode: "draft" });
  assert.equal(missing.valid, false);
  assert.match(missing.errors.join("\n"), /schemaVersion/);
  assert.match(missing.errors.join("\n"), /sessionId/);

  const invalid = validateDraftkitState({
    ...activeState({ cwd: "/tmp/draftkit-root" }),
    mode: "backend",
    approvalStatus: "maybe"
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join("\n"), /mode/);
  assert.match(invalid.errors.join("\n"), /approvalStatus/);
});

test("state schema file declares the runtime state contract", async () => {
  const schema = JSON.parse(await readFile("schemas/draftkit-state.schema.json", "utf8"));

  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(schema.properties.mode.enum.includes("draft"), true);
  assert.equal(schema.properties.mode.enum.includes("live"), true);
  assert.equal(schema.required.includes("sessionId"), true);
  assert.equal(schema.required.includes("sessionStatePath"), true);
});

test("status reports live mode when no active state exists", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    const status = await draftStatus({ cwd });

    assert.equal(status.mode, "live");
    assert.equal(status.state, "none");
    assert.equal(status.stale, false);
    assert.equal(status.next.some((action) => action.startsWith("draft-open")), true);
    assert.equal(existsSync(join(cwd, ".draftspec/state/draftkit-active.json")), false);
  });
});

test("status reports active draft state", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await draftOpen("bulk-tagging", {
      cwd,
      sessionId: "session-1",
      startPreview: false,
      now: "2026-07-03T00:00:00.000Z"
    });

    const status = await draftStatus({ cwd });

    assert.equal(status.mode, "draft");
    assert.equal(status.state, "active");
    assert.equal(status.feature, "bulk-tagging");
    assert.equal(status.approval, "unapproved");
    assert.equal(status.draftSpec, ".draftspec/features/bulk-tagging.json");
    assert.equal(status.next.includes("draft-cancel"), true);
  });
});

test("status reports stale when active mirror points to a missing session file", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeJson(join(cwd, ".draftspec/state/draftkit-active.json"), {
      ...activeState({ cwd }),
      sessionStatePath: ".draftspec/state/sessions/missing/draftkit-state.json"
    });

    const status = await draftStatus({ cwd });

    assert.equal(status.state, "stale");
    assert.equal(status.stale, true);
    assert.match(status.staleReasons.join("\n"), /missing session state/);
    assert.equal(existsSync(join(cwd, ".draftspec/state/draftkit-active.json")), true);
  });
});

test("status reports stale when cwd or process facts no longer match", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    const state = {
      ...activeState({ cwd: "/tmp/other-root" }),
      preview: { url: "http://localhost:9/examples/bulk-tagging/", port: 9, owner: "draftkit" },
      process: {
        pid: 99999999,
        cwd,
        command: "node scripts/dev-server.mjs",
        startedAt: "2026-07-03T00:00:00.000Z",
        startedBy: "draft-open"
      }
    };
    await writeJson(join(cwd, ".draftspec/state/sessions/session-1/draftkit-state.json"), state);
    await writeJson(join(cwd, ".draftspec/state/draftkit-active.json"), state);

    const status = await draftStatus({ cwd });

    assert.equal(status.state, "stale");
    assert.match(status.staleReasons.join("\n"), /cwd/);
    assert.match(status.staleReasons.join("\n"), /process 99999999/);
  });
});

test("open creates and resumes draft runtime state", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);

    const created = await draftOpen("bulk-tagging", {
      cwd,
      sessionId: "session-1",
      startPreview: false,
      now: "2026-07-03T00:00:00.000Z"
    });
    const resumed = await draftOpen("bulk-tagging", {
      cwd,
      startPreview: false,
      now: "2026-07-03T00:01:00.000Z"
    });
    const state = await readJson(join(cwd, ".draftspec/state/draftkit-active.json"));

    assert.equal(created.action, "created");
    assert.equal(resumed.action, "resumed");
    assert.equal(state.sessionId, "session-1");
    assert.equal(state.mode, "draft");
    assert.equal(state.feature, "bulk-tagging");
    assert.equal(existsSync(join(cwd, ".draftspec/state/sessions/session-1/draftkit-state.json")), true);
    assert.equal(existsSync(join(cwd, ".draftspec/logs/session-history.jsonl")), true);
  });
});

test("open creates a valid scaffold for new feature slugs", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    const opened = await draftOpen("board-columns", {
      cwd,
      sessionId: "session-1",
      startPreview: false,
      now: "2026-07-03T00:00:00.000Z"
    });
    const status = await draftStatus({ cwd });
    const spec = await readJson(join(cwd, ".draftspec/features/board-columns.json"));
    const validation = validateSpecGraph(spec);

    assert.equal(opened.feature, "board-columns");
    assert.equal(opened.draftSpec, ".draftspec/features/board-columns.json");
    assert.equal(status.feature, "board-columns");
    assert.equal(status.draftSpecValid, true);
    assert.equal(validation.valid, true, validation.errors.join("; "));
    assert.equal(spec.ui.some((item) => item.id === "draft-host"), true);
    assert.equal(spec.actions.some((action) => action.id === "open-draft-host"), true);
    assert.equal(spec.backendContracts.some((contract) => contract.id === "draftSave"), true);
  });
});

test("preview path falls back to the generic DraftKit host when an example route is missing", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    assert.equal(draftPreviewPath(cwd, "board-columns"), "/draftkit/board-columns/");

    await writeFileWithParents(join(cwd, "examples/bulk-tagging/index.html"), "<!doctype html>");

    assert.equal(draftPreviewPath(cwd, "bulk-tagging"), "/examples/bulk-tagging/");
  });
});

test("dev server serves a generic DraftKit host for feature specs without example routes", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await draftOpen("board-columns", {
      cwd,
      sessionId: "session-1",
      startPreview: false,
      now: "2026-07-03T00:00:00.000Z"
    });
    const port = await findAvailableTestPort();
    const child = spawn(process.execPath, [resolve("scripts/dev-server.mjs")], {
      cwd,
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore"
    });

    try {
      const url = `http://127.0.0.1:${port}/draftkit/board-columns/`;
      await waitForTestUrl(url);
      const response = await fetch(url);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /Generic DraftKit host/);
      assert.match(html, /board-columns/);
      assert.match(html, /Draft scaffold/);
    } finally {
      await stopChild(child);
    }
  });
});

test("DraftKit skills use direct Node commands for Desktop-safe invocation", async () => {
  const skillRoot = ".codex/skills";
  const entries = await readdir(skillRoot, { withFileTypes: true });
  const draftSkillFiles = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("draft-"))
    .map((entry) => join(skillRoot, entry.name, "SKILL.md"));

  assert.ok(draftSkillFiles.length > 0);

  for (const file of draftSkillFiles) {
    const content = await readFile(file, "utf8");
    assert.equal(content.includes("npm run draftkit:"), false, `${file} should not rely on npm run draftkit:*`);
  }
});

test("cancel clears active state and preserves specs", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeApprovedSpec(cwd);
    await draftOpen("bulk-tagging", {
      cwd,
      sessionId: "session-1",
      startPreview: false,
      now: "2026-07-03T00:00:00.000Z"
    });

    const result = await draftCancel({ cwd, now: "2026-07-03T00:02:00.000Z" });
    const session = await readJson(join(cwd, ".draftspec/state/sessions/session-1/draftkit-state.json"));

    assert.equal(result.mode, "live");
    assert.equal(result.state, "inactive");
    assert.equal(result.preserved.includes(".draftspec/features/bulk-tagging.json"), true);
    assert.equal(result.preserved.includes(".draftspec/features/bulk-tagging.approved.json"), true);
    assert.equal(session.phase, "cancelled");
    assert.equal(existsSync(join(cwd, ".draftspec/state/draftkit-active.json")), false);
    assert.equal(existsSync(join(cwd, ".draftspec/features/bulk-tagging.json")), true);
    assert.equal(existsSync(join(cwd, ".draftspec/features/bulk-tagging.approved.json")), true);
  });
});

test("cancel reports approved snapshots created after the draft was opened", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await draftOpen("bulk-tagging", {
      cwd,
      sessionId: "session-1",
      startPreview: false,
      now: "2026-07-03T00:00:00.000Z"
    });
    await writeApprovedSpec(cwd);

    const result = await draftCancel({ cwd, now: "2026-07-03T00:02:00.000Z" });

    assert.equal(result.mode, "live");
    assert.equal(result.state, "inactive");
    assert.equal(result.preserved.includes(".draftspec/features/bulk-tagging.json"), true);
    assert.equal(result.preserved.includes(".draftspec/features/bulk-tagging.approved.json"), true);
  });
});

test("cancel does not kill a process that DraftKit did not start", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore"
    });

    try {
      const state = {
        ...activeState({ cwd }),
        process: {
          pid: child.pid,
          cwd,
          command: `${process.execPath} -e setInterval`,
          startedAt: "2026-07-03T00:00:00.000Z",
          startedBy: "external"
        }
      };
      await writeJson(join(cwd, ".draftspec/state/sessions/session-1/draftkit-state.json"), state);
      await writeJson(join(cwd, ".draftspec/state/draftkit-active.json"), state);

      const result = await draftCancel({ cwd });

      assert.equal(result.stoppedProcess, false);
      assert.match(result.stopReason, /not started by draft-open/);
      assert.equal(isAlive(child.pid), true);
    } finally {
      await stopChild(child);
    }
  });
});

test("plan-to-go-live rejects unapproved specs", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);

    await assert.rejects(
      () => draftPlanToGoLive("bulk-tagging", { cwd }),
      /approved spec/
    );
    assert.equal(existsSync(join(cwd, ".draftspec/go-live/bulk-tagging.plan.md")), false);
    assert.equal(existsSync(join(cwd, ".draftspec/go-live/bulk-tagging.plan.json")), false);
  });
});

test("plan-to-go-live writes plan artifacts for approved specs", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    const approved = await writeApprovedSpec(cwd);

    const result = await draftPlanToGoLive("bulk-tagging", {
      cwd,
      now: "2026-07-03T00:03:00.000Z"
    });
    const plan = await readJson(join(cwd, ".draftspec/go-live/bulk-tagging.plan.json"));
    const markdown = await readFile(join(cwd, ".draftspec/go-live/bulk-tagging.plan.md"), "utf8");

    assert.equal(result.snapshotId, approved.snapshotId);
    assert.equal(plan.feature, "bulk-tagging");
    assert.equal(plan.snapshotId, approved.snapshotId);
    assert.equal(plan.contracts.some((contract) => contract.id === "bulkApplyTags"), true);
    assert.match(markdown, new RegExp(approved.snapshotId));
    assert.equal(plan.backendTarget.type, "fixture-backend-sandbox");
  });
});

test("implement-to-live rejects unapproved specs", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);

    await assert.rejects(
      () => draftImplementToLive("bulk-tagging", { cwd }),
      /approved spec/
    );
    assert.equal(existsSync(join(cwd, "fixtures/backend-sandbox/features/bulk-tagging.implementation.json")), false);
  });
});

test("implement-to-live uses approved plan and spec only", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    const approved = await writeApprovedSpec(cwd);
    await writeDraftSpec(cwd, { tamperDraftOnly: true });
    await draftPlanToGoLive("bulk-tagging", {
      cwd,
      now: "2026-07-03T00:03:00.000Z"
    });

    const result = await draftImplementToLive("bulk-tagging", {
      cwd,
      now: "2026-07-03T00:04:00.000Z"
    });
    const implementation = await readJson(
      join(cwd, "fixtures/backend-sandbox/features/bulk-tagging.implementation.json")
    );

    assert.equal(result.snapshotId, approved.snapshotId);
    assert.equal(implementation.snapshotId, approved.snapshotId);
    assert.equal(implementation.source.usesRuntimeStateForAuthorization, false);
    assert.equal(implementation.source.usesApprovedSnapshotOnly, true);
    assert.equal(implementation.contracts.some((contract) => contract.id === "bulkApplyTags"), true);
    assert.equal(implementation.contracts.some((contract) => contract.id === "draftOnlyContract"), false);
  });
});

test("implement-to-live rejects stale plans with snapshot mismatch", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeApprovedSpec(cwd);
    await writeJson(join(cwd, ".draftspec/go-live/bulk-tagging.plan.json"), {
      schemaVersion: 1,
      feature: "bulk-tagging",
      approvedSpecPath: ".draftspec/features/bulk-tagging.approved.json",
      snapshotId: "stale-snapshot"
    });

    await assert.rejects(
      () => draftImplementToLive("bulk-tagging", { cwd }),
      /snapshotId mismatch/
    );
    assert.equal(existsSync(join(cwd, "fixtures/backend-sandbox/features/bulk-tagging.implementation.json")), false);
  });
});

test("plan-to-go-live overwrites stale plan with the current approved snapshot", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    const approved = await writeApprovedSpec(cwd);
    await writeJson(join(cwd, ".draftspec/go-live/bulk-tagging.plan.json"), {
      schemaVersion: 1,
      feature: "bulk-tagging",
      approvedSpecPath: ".draftspec/features/bulk-tagging.approved.json",
      snapshotId: "old-snapshot"
    });

    await draftPlanToGoLive("bulk-tagging", { cwd });
    const plan = await readJson(join(cwd, ".draftspec/go-live/bulk-tagging.plan.json"));

    assert.equal(plan.snapshotId, approved.snapshotId);
  });
});

async function withTempDraftkitRoot(callback) {
  const cwd = await mkdtemp(join(tmpdir(), "draftkit-session-"));
  try {
    await callback(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function createValidDraftSpec() {
  const spec = createBulkTaggingSpec();
  recordAction(spec, {
    id: "select-items",
    from: "*",
    event: "select.items",
    to: "selected",
    ui: "items-route",
    payload: { selectedCount: 2 }
  });
  recordAction(spec, {
    id: "open-bulk-tag-dialog",
    from: "selected",
    event: "click.bulk-tag-button",
    to: "dialog_open",
    ui: "bulk-tag-button"
  });
  recordAction(spec, {
    id: "apply-tag-optimistic",
    from: "dialog_open",
    event: "submit.bulk-tag-dialog",
    to: "saving",
    ui: "bulk-tag-dialog",
    backendContract: "bulkApplyTags",
    optimistic: true
  });
  recordAction(spec, {
    id: "bulk-tag-success",
    from: "saving",
    event: "backend.bulkApplyTags.success",
    to: "success",
    backendContract: "bulkApplyTags"
  });
  recordAction(spec, {
    id: "bulk-tag-rollback",
    from: "saving",
    event: "backend.bulkApplyTags.failure",
    to: "rollback",
    backendContract: "bulkApplyTags",
    rollback: true
  });
  return spec;
}

async function writeDraftSpec(cwd, { tamperDraftOnly = false } = {}) {
  const spec = createValidDraftSpec();
  if (tamperDraftOnly) {
    spec.backendContracts.push({
      id: "draftOnlyContract",
      operation: "draftOnlyContract"
    });
  }
  await writeJson(join(cwd, ".draftspec/features/bulk-tagging.json"), spec);
  return spec;
}

async function writeApprovedSpec(cwd) {
  const draft = await writeDraftSpec(cwd);
  const approved = approveSpecGraph(draft, { approvedAt: "2026-07-03T00:00:00.000Z" });
  await writeJson(join(cwd, ".draftspec/features/bulk-tagging.approved.json"), approved);
  return approved;
}

function activeState({ cwd }) {
  return {
    schemaVersion: 1,
    sessionId: "session-1",
    cwd,
    surface: "test",
    mode: "draft",
    phase: "open",
    feature: "bulk-tagging",
    preview: { url: null, port: null, owner: "none" },
    process: null,
    draftSpec: ".draftspec/features/bulk-tagging.json",
    approvedSpec: null,
    snapshotId: null,
    approvalStatus: "unapproved",
    checks: [],
    lastAction: "draft-open",
    lastUpdatedAt: "2026-07-03T00:00:00.000Z",
    sessionStatePath: ".draftspec/state/sessions/session-1/draftkit-state.json",
    next: ["draft-status", "draft-review", "draft-cancel"]
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFileWithParents(path, `${stableStringify(value)}\n`);
}

async function writeFileWithParents(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolveStop) => {
    const timeout = setTimeout(resolveStop, 1000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
  });
}

function findAvailableTestPort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.once("listening", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
    server.listen(0, "127.0.0.1");
  });
}

async function waitForTestUrl(url) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling until the server accepts connections.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
