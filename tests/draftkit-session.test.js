import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
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
  assert.match(schema.properties.sessionStatePath.pattern, /sessions/);
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

test("status rejects tampered session state paths outside the active session", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeJson(join(cwd, "outside-session.json"), {
      ...activeState({ cwd }),
      sessionId: "outside-session"
    });
    await writeJson(join(cwd, ".draftspec/state/draftkit-active.json"), {
      ...activeState({ cwd }),
      sessionStatePath: "outside-session.json"
    });

    const status = await draftStatus({ cwd });

    assert.equal(status.state, "stale");
    assert.match(status.staleReasons.join("\n"), /session state path does not match/);
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
        command: "node scripts/draftkit-preview-server.mjs",
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

test("open skips a Windows-like all-interface live server on 5173 and verifies the draft port", async (t) => {
  await withTempDraftkitRoot(async (cwd) => {
    const liveServer = await startNonDraftkitServerOnDefaultPort(t);
    if (!liveServer) return;
    let cancelled = false;

    try {
      const opened = await draftOpen("todo", {
        cwd,
        sessionId: "session-1",
        now: "2026-07-03T00:00:00.000Z"
      });

      assert.ok(opened.draftPreview, "draftOpen returns draftPreview details");
      assert.ok(opened.livePreview, "draftOpen returns livePreview details");
      assert.notEqual(opened.draftPreview.port, 5173);
      assert.ok(opened.draftPreview.port >= 5174);
      assert.equal(opened.draftPreview.owner, "draftkit");
      assert.match(opened.draftPreview.url, new RegExp(`:${opened.draftPreview.port}/`));
      assert.equal(opened.livePreview.port, 5173);
      assert.equal(opened.livePreview.owner, "external");
      assert.equal(opened.livePreview.healthy, true);
      const state = await readJson(join(cwd, ".draftspec/state/draftkit-active.json"));
      const liveIdentityResponse = await fetch("http://localhost:5173/__draftkit/preview-identity", {
        headers: { "x-draftkit-preview-token": state.process.previewIdentity.token }
      });
      const wrongTokenResponse = await fetch(state.process.previewIdentity.url, {
        headers: { "x-draftkit-preview-token": "wrong-token" }
      });
      const identityResponse = await fetch(state.process.previewIdentity.url, {
        headers: { "x-draftkit-preview-token": state.process.previewIdentity.token }
      });
      const identity = await identityResponse.json();
      const status = await draftStatus({ cwd });
      const acceptedLog = await readFile(resolve(cwd, state.process.logPath), "utf8");

      assert.equal(liveIdentityResponse.status, 404);
      assert.equal(wrongTokenResponse.status, 403);
      assert.equal(identityResponse.status, 200);
      assert.equal(identity.owner, "draftkit");
      assert.equal(identity.pid, state.process.pid);
      assert.equal(identity.sessionId, "session-1");
      assert.equal(identity.feature, "todo");
      assert.equal(resolve(identity.cwd), resolve(state.process.previewIdentity.cwd));
      assert.equal(status.draftPreview.healthy, true);
      assert.equal(status.draftPreview.port, opened.draftPreview.port);
      assert.doesNotMatch(acceptedLog, /EADDRINUSE/);

      const cancelledDraft = await draftCancel({ cwd });
      cancelled = true;

      assert.equal(cancelledDraft.stoppedProcess, true);
      assert.match(cancelledDraft.stopReason, /stopped DraftKit-owned preview process/);
    } finally {
      await closeServer(liveServer);
      if (!cancelled) await draftCancel({ cwd });
    }
  });
});

test("status marks preview stale when HTTP 200 lacks matching DraftKit identity", async (t) => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    const liveServer = await startNonDraftkitServerOnDefaultPort(t);
    if (!liveServer) return;
    const state = {
      ...activeState({ cwd }),
      preview: { url: "http://localhost:5173/draftkit/bulk-tagging/", port: 5173, owner: "draftkit" },
      draftPreview: { url: "http://localhost:5173/draftkit/bulk-tagging/", port: 5173, owner: "draftkit" },
      livePreview: { url: "http://localhost:5173/", port: 5173, owner: "external", healthy: true },
      process: {
        pid: process.pid,
        cwd: join(cwd, ".draftspec/state/workspaces/session-1"),
        command: `${process.execPath} scripts/draftkit-preview-server.mjs`,
        startedAt: "2026-07-03T00:00:00.000Z",
        startedBy: "draft-open",
        previewIdentity: {
          url: "http://localhost:5173/__draftkit/preview-identity",
          token: "recorded-token",
          sessionId: "session-1",
          feature: "bulk-tagging",
          cwd: join(cwd, ".draftspec/state/workspaces/session-1")
        }
      }
    };
    await writeJson(join(cwd, ".draftspec/state/workspaces/session-1/.draftspec/state/draftkit-workspace.json"), {
      owner: "draftkit",
      sessionId: "session-1",
      feature: "bulk-tagging",
      cwd
    });
    await writeJson(join(cwd, ".draftspec/state/sessions/session-1/draftkit-state.json"), state);
    await writeJson(join(cwd, ".draftspec/state/draftkit-active.json"), state);

    try {
      const status = await draftStatus({ cwd });

      assert.equal(status.state, "stale");
      assert.equal(status.draftPreview.healthy, false);
      assert.match(status.staleReasons.join("\n"), /preview identity mismatch/i);
      assert.match(status.staleReasons.join("\n"), /HTTP 404|not valid JSON|Unexpected token|identity/i);
    } finally {
      await closeServer(liveServer);
    }
  });
});

test("open rejects missing feature when no isolated draft can be resumed", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await assert.rejects(
      () => draftOpen(undefined, { cwd, startPreview: false }),
      /feature[- ]slug[- ]required|feature slug is required|feature is required/i
    );
  });
});

test("npm open script stays generic and demo open script passes bulk-tagging explicitly", async () => {
  const packageJson = await readJson("package.json");

  assert.equal(packageJson.scripts["draftkit:open"], "node scripts/draftkit-session.mjs open");
  assert.match(packageJson.scripts["draftkit:open:bulk-tagging"], /\bopen\s+bulk-tagging\b/);
  assert.equal(packageJson.scripts.dev, "node scripts/dev-server.mjs");
  assert.match(packageJson.scripts["dev:bulk-tagging"], /DRAFTKIT_FEATURE=bulk-tagging/);
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

test("status reports stale when the live baseline advances after a draft opens", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'baseline';\n");
    await initializeGitBaseline(cwd);
    const opened = await draftOpen("bulk-tagging", {
      cwd,
      sessionId: "session-1",
      startPreview: false,
      now: "2026-07-03T00:00:00.000Z"
    });

    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'live-change';\n");
    await git(cwd, ["add", "src/app.js"]);
    await git(cwd, ["commit", "-m", "advance live"]);

    const status = await draftStatus({ cwd });

    assert.ok(opened.liveBaseline, "draftOpen records the liveBaseline used for the draft");
    assert.ok(status.liveBaseline, "draftStatus reports the recorded liveBaseline");
    assert.equal(status.liveBaseline.commit, opened.liveBaseline.commit);
    assert.equal(status.stale, true);
    assert.match(status.staleReasons.join("\n"), /live baseline|live checkpoint|baseline/i);
    assert.equal(status.next.includes("choose refresh/rebase for bulk-tagging"), true);
    assert.equal(status.next.includes("choose continue stale for bulk-tagging"), true);
    assert.equal(status.next.some((action) => action.startsWith("draft-refresh")), false);
    assert.equal(status.next.some((action) => action.startsWith("draft-rebase")), false);
    assert.equal(status.next.some((action) => action.startsWith("draft-continue-stale")), false);
    assert.equal(status.next.includes("draft-cancel"), true);
  });
});

test("status reports stale when the isolated workspace marker is missing", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'baseline';\n");
    await initializeGitBaseline(cwd);
    const opened = await draftOpen("bulk-tagging", {
      cwd,
      sessionId: "session-1",
      startPreview: false,
      now: "2026-07-03T00:00:00.000Z"
    });
    const workspacePath = resolveFromCwd(cwd, opened.draftWorkspace.path);
    await rm(join(workspacePath, ".draftspec/state/draftkit-workspace.json"), { force: true });

    const status = await draftStatus({ cwd });

    assert.equal(status.state, "stale");
    assert.equal(status.stale, true);
    assert.match(status.staleReasons.join("\n"), /workspace marker is missing/i);
  });
});

test("status does not inspect specs from an unvalidated draft workspace path", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'baseline';\n");
    await initializeGitBaseline(cwd);
    const outsidePath = await mkdtemp(join(tmpdir(), "draftkit-status-outside-"));
    const outsideApproved = await writeApprovedSpec(outsidePath);
    const state = {
      ...activeState({ cwd }),
      draftWorkspace: {
        path: outsidePath,
        owner: "draftkit",
        feature: "bulk-tagging"
      },
      isolation: {
        strategy: "workspace-copy",
        separated: true
      }
    };
    await writeJson(join(cwd, ".draftspec/state/sessions/session-1/draftkit-state.json"), state);
    await writeJson(join(cwd, ".draftspec/state/draftkit-active.json"), state);

    try {
      const status = await draftStatus({ cwd });

      assert.equal(status.state, "stale");
      assert.match(status.staleReasons.join("\n"), /relative|outside DraftKit workspace storage/i);
      assert.equal(status.approval, "unapproved");
      assert.equal(status.snapshotId, null);
      assert.notEqual(status.snapshotId, outsideApproved.snapshotId);
    } finally {
      await rm(outsidePath, { recursive: true, force: true });
    }
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
    const child = spawn(process.execPath, [resolve("scripts/draftkit-preview-server.mjs")], {
      cwd,
      env: { ...process.env, PORT: String(port), DRAFTKIT_FEATURE: "board-columns" },
      stdio: "ignore"
    });

    try {
      const url = `http://127.0.0.1:${port}/draftkit/board-columns/`;
      await waitForTestUrl(url);
      const response = await fetch(url);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /Review the current workflow shape/);
      assert.match(html, /Board Columns/);
      assert.match(html, /Workflow scaffold/);
      assert.doesNotMatch(html, />DraftKit</);
      assert.doesNotMatch(html, /Backend Contracts/);
    } finally {
      await stopChild(child);
    }
  });
});

test("preview server and generic dev entrypoint require an explicit feature", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    const missingFeature = spawn(process.execPath, [resolve("scripts/draftkit-preview-server.mjs")], {
      cwd,
      env: { ...process.env, PORT: String(await findAvailableTestPort()) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const missingExit = await waitForExit(missingFeature);

    assert.notEqual(missingExit.code, 0);
    assert.match(missingExit.stderr, /DRAFTKIT_FEATURE is required/);

    const genericDev = spawn(process.execPath, [resolve("scripts/dev-server.mjs")], {
      cwd,
      env: { ...process.env, PORT: String(await findAvailableTestPort()) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const genericDevExit = await waitForExit(genericDev);

    assert.notEqual(genericDevExit.code, 0);
    assert.match(genericDevExit.stderr, /DRAFTKIT_FEATURE is required/);

    const legacyAlias = spawn(process.execPath, [resolve("scripts/draftkit-preview-server.mjs")], {
      cwd,
      env: {
        ...process.env,
        PORT: String(await findAvailableTestPort()),
        DRAFTKIT_DEMO_FEATURE: "bulk-tagging"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const legacyAliasExit = await waitForExit(legacyAlias);

    assert.notEqual(legacyAliasExit.code, 0);
    assert.match(legacyAliasExit.stderr, /DRAFTKIT_FEATURE is required/);

    const port = await findAvailableTestPort();
    const demo = spawn(process.execPath, [resolve("scripts/dev-server.mjs")], {
      cwd,
      env: { ...process.env, PORT: String(port), DRAFTKIT_FEATURE: "bulk-tagging" },
      stdio: "ignore"
    });

    try {
      const url = `http://127.0.0.1:${port}/draftkit/bulk-tagging/`;
      await waitForTestUrl(url);
      const response = await fetch(url);

      assert.equal(response.status, 200);
    } finally {
      await stopChild(demo);
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

test("cancel discards draft-owned edits in the isolated workspace", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'live';\n");
    await initializeGitBaseline(cwd);
    const opened = await draftOpen("bulk-tagging", {
      cwd,
      sessionId: "session-1",
      startPreview: false,
      now: "2026-07-03T00:00:00.000Z"
    });
    assert.ok(opened.draftWorkspace, "draftOpen returns the isolated draftWorkspace");
    const workspacePath = resolveFromCwd(cwd, opened.draftWorkspace.path);

    await writeFileWithParents(join(workspacePath, "src/app.js"), "export const value = 'draft';\n");

    const result = await draftCancel({ cwd, now: "2026-07-03T00:02:00.000Z" });
    const liveFile = await readFile(join(cwd, "src/app.js"), "utf8");

    assert.ok(result.cancellation, "draftCancel returns cancellation details");
    assert.ok(result.isolation, "draftCancel returns isolation details");
    assert.equal(result.cancellation.blocked, false);
    assert.equal(result.isolation.discardedDraftWorkspace, true);
    assert.equal(existsSync(workspacePath), false);
    assert.equal(liveFile, "export const value = 'live';\n");
  });
});

test("cancel preserves unrelated live work made before the isolated draft opens", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'baseline';\n");
    await initializeGitBaseline(cwd);
    await writeFileWithParents(join(cwd, "notes.txt"), "pre-existing live work\n");
    const opened = await draftOpen("bulk-tagging", {
      cwd,
      sessionId: "session-1",
      startPreview: false,
      now: "2026-07-03T00:00:00.000Z"
    });
    assert.ok(opened.draftWorkspace, "draftOpen returns the isolated draftWorkspace");

    await writeFileWithParents(
      join(resolveFromCwd(cwd, opened.draftWorkspace.path), "src/app.js"),
      "export const value = 'draft';\n"
    );

    const result = await draftCancel({ cwd, now: "2026-07-03T00:02:00.000Z" });
    const preExistingLiveWork = await readFile(join(cwd, "notes.txt"), "utf8");

    assert.ok(result.cancellation, "draftCancel returns cancellation details");
    assert.equal(result.cancellation.blocked, false);
    assert.equal(preExistingLiveWork, "pre-existing live work\n");
  });
});

test("cancel blocks when draft edits cannot be separated from live work", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'baseline';\n");
    await initializeGitBaseline(cwd);
    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'mixed-live-and-draft';\n");
    const state = {
      ...activeState({ cwd }),
      liveBaseline: await currentGitBaseline(cwd),
      draftWorkspace: null,
      isolation: {
        strategy: "none",
        separated: false,
        reason: "legacy session modified the live workspace directly"
      }
    };
    await writeJson(join(cwd, ".draftspec/state/sessions/session-1/draftkit-state.json"), state);
    await writeJson(join(cwd, ".draftspec/state/draftkit-active.json"), state);

    const result = await draftCancel({ cwd });
    const liveFile = await readFile(join(cwd, "src/app.js"), "utf8");

    assert.ok(result.cancellation, "draftCancel returns cancellation details");
    assert.equal(result.cancellation.blocked, true);
    assert.match(result.cancellation.reason, /cannot separate|isolation|live work/i);
    assert.equal(existsSync(join(cwd, ".draftspec/state/draftkit-active.json")), true);
    assert.equal(liveFile, "export const value = 'mixed-live-and-draft';\n");
  });
});

test("cancel blocks tampered session state paths without reading arbitrary state", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'baseline';\n");
    await initializeGitBaseline(cwd);
    await writeJson(join(cwd, "outside-session.json"), {
      ...activeState({ cwd }),
      draftWorkspace: {
        path: "outside-workspace",
        owner: "draftkit"
      }
    });
    await writeJson(join(cwd, ".draftspec/state/sessions/session-1/draftkit-state.json"), activeState({ cwd }));
    await writeJson(join(cwd, ".draftspec/state/draftkit-active.json"), {
      ...activeState({ cwd }),
      sessionStatePath: "outside-session.json"
    });

    const result = await draftCancel({ cwd });

    assert.equal(result.cancellation.blocked, true);
    assert.match(result.cancellation.reason, /session state path does not match/);
    assert.equal(existsSync(join(cwd, ".draftspec/state/draftkit-active.json")), true);
  });
});

test("cancel blocks when the isolated workspace directory is missing", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'baseline';\n");
    await initializeGitBaseline(cwd);
    const opened = await draftOpen("bulk-tagging", {
      cwd,
      sessionId: "session-1",
      startPreview: false,
      now: "2026-07-03T00:00:00.000Z"
    });
    await rm(resolveFromCwd(cwd, opened.draftWorkspace.path), { recursive: true, force: true });

    const result = await draftCancel({ cwd });

    assert.equal(result.cancellation.blocked, true);
    assert.match(result.cancellation.reason, /draft workspace is missing/i);
    assert.equal(existsSync(join(cwd, ".draftspec/state/draftkit-active.json")), true);
  });
});

test("cancel blocks tampered draft workspace paths outside DraftKit storage", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'baseline';\n");
    await initializeGitBaseline(cwd);
    const outsidePath = await mkdtemp(join(tmpdir(), "draftkit-outside-"));
    const traversalPath = "../outside-workspace";

    try {
      for (const draftWorkspacePath of [outsidePath, traversalPath]) {
        const state = {
          ...activeState({ cwd }),
          draftWorkspace: {
            path: draftWorkspacePath,
            owner: "draftkit"
          },
          isolation: {
            strategy: "workspace-copy",
            separated: true
          }
        };
        await writeJson(join(cwd, ".draftspec/state/sessions/session-1/draftkit-state.json"), state);
        await writeJson(join(cwd, ".draftspec/state/draftkit-active.json"), state);

        const result = await draftCancel({ cwd });

        assert.equal(result.cancellation.blocked, true);
        assert.match(result.cancellation.reason, /relative|outside DraftKit workspace storage/i);
        assert.equal(existsSync(join(cwd, ".draftspec/state/draftkit-active.json")), true);
        assert.equal(existsSync(outsidePath), true);
      }
    } finally {
      await rm(outsidePath, { recursive: true, force: true });
    }
  });
});

test("cancel blocks an existing workspace without a DraftKit ownership marker", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'baseline';\n");
    await initializeGitBaseline(cwd);
    const workspacePath = join(cwd, ".draftspec/state/workspaces/session-1");
    await mkdir(workspacePath, { recursive: true });
    await writeFileWithParents(join(workspacePath, "owned-by-someone-else.txt"), "do not delete\n");
    const state = {
      ...activeState({ cwd }),
      draftWorkspace: {
        path: ".draftspec/state/workspaces/session-1",
        owner: "draftkit"
      },
      isolation: {
        strategy: "workspace-copy",
        separated: true
      }
    };
    await writeJson(join(cwd, ".draftspec/state/sessions/session-1/draftkit-state.json"), state);
    await writeJson(join(cwd, ".draftspec/state/draftkit-active.json"), state);

    const result = await draftCancel({ cwd });

    assert.equal(result.cancellation.blocked, true);
    assert.match(result.cancellation.reason, /marker/i);
    assert.equal(existsSync(workspacePath), true);
    assert.equal(existsSync(join(workspacePath, "owned-by-someone-else.txt")), true);
  });
});

test("cancel blocks a workspace marker without matching cwd and feature", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeFileWithParents(join(cwd, "src/app.js"), "export const value = 'baseline';\n");
    await initializeGitBaseline(cwd);
    const workspacePath = join(cwd, ".draftspec/state/workspaces/session-1");
    await writeJson(join(workspacePath, ".draftspec/state/draftkit-workspace.json"), {
      owner: "draftkit",
      sessionId: "session-1"
    });
    const state = {
      ...activeState({ cwd }),
      draftWorkspace: {
        path: ".draftspec/state/workspaces/session-1",
        owner: "draftkit"
      },
      isolation: {
        strategy: "workspace-copy",
        separated: true
      }
    };
    await writeJson(join(cwd, ".draftspec/state/sessions/session-1/draftkit-state.json"), state);
    await writeJson(join(cwd, ".draftspec/state/draftkit-active.json"), state);

    const result = await draftCancel({ cwd });

    assert.equal(result.cancellation.blocked, true);
    assert.match(result.cancellation.reason, /cwd|feature/i);
    assert.equal(existsSync(workspacePath), true);
  });
});

test("cancel does not kill a process that DraftKit did not start", async () => {
  await withTempDraftkitRoot(async (cwd) => {
    await writeDraftSpec(cwd);
    await writeJson(join(cwd, ".draftspec/state/workspaces/session-1/.draftspec/state/draftkit-workspace.json"), {
      owner: "draftkit",
      sessionId: "session-1",
      feature: "bulk-tagging",
      cwd
    });
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
    draftPreview: { url: null, port: null, owner: "none" },
    livePreview: { url: null, port: null, owner: "none" },
    process: null,
    draftSpec: ".draftspec/features/bulk-tagging.json",
    approvedSpec: null,
    snapshotId: null,
    approvalStatus: "unapproved",
    liveBaseline: { type: "git", commit: "baseline-commit", dirty: false },
    draftWorkspace: {
      path: ".draftspec/state/workspaces/session-1",
      owner: "draftkit"
    },
    isolation: {
      strategy: "workspace-copy",
      separated: true
    },
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

function waitForExit(child) {
  return new Promise((resolveExit, rejectExit) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => {
      resolveExit({ code, signal, stdout, stderr });
    });
  });
}

function findAvailableTestPort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.once("error", rejectPort);
    server.once("listening", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
    server.listen(0, "127.0.0.1");
  });
}

function startNonDraftkitServerOnDefaultPort(t) {
  return new Promise((resolveServer, rejectServer) => {
    const server = createHttpServer((request, response) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname === "/__draftkit/preview-identity") {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
        return;
      }
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("live app, not DraftKit");
    });
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        t.skip("port 5173 is already occupied, so this test cannot own the non-DraftKit fixture server");
        resolveServer(null);
        return;
      }
      rejectServer(error);
    });
    server.once("listening", () => resolveServer(server));
    server.listen(5173);
  });
}

function closeServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

async function initializeGitBaseline(cwd) {
  await git(cwd, ["init"]);
  await git(cwd, ["config", "user.email", "draftkit-test@example.com"]);
  await git(cwd, ["config", "user.name", "DraftKit Test"]);
  await git(cwd, ["add", "."]);
  await git(cwd, ["commit", "-m", "baseline"]);
}

async function currentGitBaseline(cwd) {
  const commit = await git(cwd, ["rev-parse", "HEAD"]);
  const status = await git(cwd, ["status", "--porcelain"]);
  return { type: "git", commit: commit.trim(), dirty: status.trim().length > 0 };
}

function git(cwd, args) {
  return new Promise((resolveGit, rejectGit) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", rejectGit);
    child.once("exit", (code) => {
      if (code === 0) {
        resolveGit(stdout);
        return;
      }
      rejectGit(new Error(`git ${args.join(" ")} failed with ${code}: ${stderr || stdout}`));
    });
  });
}

function resolveFromCwd(cwd, maybeRelativePath) {
  assert.equal(typeof maybeRelativePath, "string");
  return resolve(cwd, maybeRelativePath);
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
