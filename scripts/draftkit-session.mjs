#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, openSync } from "node:fs";
import {
  access,
  appendFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  addBackendContract,
  addFixture,
  addState,
  addUiLocation,
  createSpecGraph,
  mapApprovedSpecToBackendTasks,
  recordAction,
  stableStringify,
  validateSpecGraph
} from "../src/draftkit/index.js";

const DEFAULT_PORT = 5173;
const DEFAULT_PREVIEW_HOST = "127.0.0.1";
const STATE_SCHEMA_VERSION = 1;
const PREVIEW_TIMEOUT_MS = 5000;
const FEATURE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const DRAFT_WORKSPACE_MARKER = join(".draftspec", "state", "draftkit-workspace.json");

const __filename = fileURLToPath(import.meta.url);
const execFileAsync = promisify(execFile);

export function draftkitPaths(cwd = process.cwd()) {
  const draftspec = join(cwd, ".draftspec");
  return {
    cwd,
    draftspec,
    featuresDir: join(draftspec, "features"),
    goLiveDir: join(draftspec, "go-live"),
    stateDir: join(draftspec, "state"),
    sessionsDir: join(draftspec, "state", "sessions"),
    workspacesDir: join(draftspec, "state", "workspaces"),
    logsDir: join(draftspec, "logs"),
    activeState: join(draftspec, "state", "draftkit-active.json"),
    historyLog: join(draftspec, "logs", "session-history.jsonl"),
    schema: join(cwd, "schemas", "draftkit-state.schema.json"),
    fixtureBackendDir: join(cwd, "fixtures", "backend-sandbox"),
    fixtureBackendFeaturesDir: join(cwd, "fixtures", "backend-sandbox", "features")
  };
}

export async function draftStatus(options = {}) {
  const cwd = resolve(options.cwd || process.cwd());
  const paths = draftkitPaths(cwd);
  const active = await readJsonIfExists(paths.activeState);

  if (!active) {
    const livePreview = await inspectLivePreview(cwd, null);
    return {
      command: "draft-status",
      mode: "live",
      state: "none",
      feature: null,
      preview: { url: null, port: null, healthy: "unknown" },
      draftPreview: { url: null, port: null, healthy: "unknown" },
      livePreview,
      liveBaseline: null,
      draftWorkspace: null,
      isolation: { status: "none", strategy: "none", limitation: null },
      draftSpec: null,
      approvedSpec: null,
      approval: "none",
      snapshotId: null,
      stale: false,
      staleReasons: [],
      checks: [],
      next: ["draft-open <feature>"]
    };
  }

  const sessionPathInfo = resolveSessionStatePath(cwd, active);
  const sessionPath = sessionPathInfo.path;
  const sessionState = sessionPathInfo.valid ? await readJsonIfExists(sessionPath) : null;
  const state = sessionState || active;
  const staleReasons = [];

  if (!sessionPathInfo.valid) staleReasons.push(sessionPathInfo.reason);
  if (!sessionState) staleReasons.push("active mirror references missing session state");

  const validation = validateDraftkitState(state);
  if (!validation.valid) staleReasons.push(...validation.errors);
  if (state.cwd && resolve(state.cwd) !== cwd) staleReasons.push("state cwd does not match current cwd");

  const workspaceIntegrity = await validateDraftWorkspaceIntegrity(cwd, state);
  if (!workspaceIntegrity.valid) staleReasons.push(workspaceIntegrity.reason);
  const specRoot = workspaceIntegrity.valid ? workspaceIntegrity.workspacePath : cwd;
  const liveMovement = await inspectLiveMovement(cwd, state.liveBaseline);
  staleReasons.push(...liveMovement.staleReasons);

  const specInfo = await inspectDraftSessionSpecs(cwd, specRoot, state.feature);
  const preview = await inspectPreview(state, cwd);
  if (preview.staleReason) staleReasons.push(preview.staleReason);

  const stale = staleReasons.length > 0;
  const approval = specInfo.approvalStatus;
  const livePreview = await inspectLivePreview(cwd, state);

  return {
    command: "draft-status",
    mode: stale ? "unknown" : state.mode,
    state: stale ? "stale" : state.mode === "draft" ? "active" : "inactive",
    feature: state.feature || null,
    preview: {
      url: state.preview?.url || null,
      port: state.preview?.port || null,
      healthy: preview.healthy
    },
    draftPreview: {
      url: state.preview?.url || null,
      port: state.preview?.port || null,
      healthy: preview.healthy
    },
    livePreview,
    liveBaseline: state.liveBaseline || null,
    currentLiveBaseline: liveMovement.currentBaseline,
    draftWorkspace: state.draftWorkspace || null,
    isolation: state.isolation || {
      status: "legacy-unisolated",
      strategy: "none",
      limitation: "Runtime state does not include an isolated draft workspace."
    },
    draftSpec: specInfo.draftSpec,
    draftSpecValid: specInfo.draftSpecValid,
    approvedSpec: specInfo.approvedSpec,
    approval,
    snapshotId: specInfo.snapshotId,
    stale,
    staleReasons,
    checks: state.checks || [],
    next: nextActions({ stale, mode: state.mode, approval, feature: state.feature })
  };
}

export async function draftOpen(feature, options = {}) {
  const cwd = resolve(options.cwd || process.cwd());
  const paths = draftkitPaths(cwd);
  await ensureRuntimeDirs(paths);
  const existingStatus = await draftStatus({ cwd });
  const existingActive = await readJsonIfExists(paths.activeState);
  const safeFeature = await resolveOpenFeature(feature, cwd, existingActive);
  const now = isoNow(options.now);
  const sessionId =
    options.sessionId ||
    (existingActive?.feature === safeFeature && existingActive?.sessionId) ||
    process.env.DRAFTKIT_SESSION_ID ||
    process.env.CODEX_SESSION_ID ||
    process.env.OMX_SESSION_ID ||
    `draftkit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (existingActive?.feature === safeFeature && existingStatus.state === "stale") {
    throw new Error(
      `Draft ${safeFeature} is stale; choose refresh/rebase, continue stale, or draft-cancel`
    );
  }

  let action = "created";
  let preview = { url: null, port: null, owner: "none" };
  let livePreview = await inspectLivePreview(cwd, existingActive);
  let processInfo = null;
  let liveBaseline = null;
  let draftWorkspace = null;
  let isolation = null;
  let draftSpecPath = null;
  let approvedInfo = null;

  if (existingActive?.feature === safeFeature && existingStatus.state === "active") {
    action = "resumed";
    preview = existingActive.preview || preview;
    livePreview = existingActive.livePreview || livePreview;
    processInfo = existingActive.process || null;
    liveBaseline = existingActive.liveBaseline || null;
    draftWorkspace = existingActive.draftWorkspace || null;
    isolation = existingActive.isolation || null;
    const workspaceRoot = draftWorkspaceAbsolutePath(existingActive, cwd) || cwd;
    draftSpecPath = join(workspaceRoot, ".draftspec", "features", `${safeFeature}.json`);
    approvedInfo = await inspectSpecs(workspaceRoot, safeFeature);
  } else if (options.startPreview !== false) {
    const liveDraftSpecPath = await ensureDraftSpec(cwd, safeFeature);
    approvedInfo = await inspectSpecs(cwd, safeFeature);
    liveBaseline = await captureLiveBaseline(cwd);
    const workspace = await ensureDraftWorkspace(cwd, safeFeature, sessionId, liveBaseline, options);
    draftWorkspace = workspace.draftWorkspace;
    isolation = workspace.isolation;
    const workspaceRoot = resolveWorkspacePath(cwd, draftWorkspace.path);
    await syncDraftSpecsToWorkspace(cwd, workspaceRoot);
    draftSpecPath = join(workspaceRoot, toRelative(cwd, liveDraftSpecPath));
    const started = await ensurePreview(cwd, workspaceRoot, safeFeature, sessionId, options);
    preview = started.preview;
    livePreview = started.livePreview;
    processInfo = started.process;
  } else {
    const liveDraftSpecPath = await ensureDraftSpec(cwd, safeFeature);
    approvedInfo = await inspectSpecs(cwd, safeFeature);
    liveBaseline = await captureLiveBaseline(cwd);
    const workspace = await ensureDraftWorkspace(cwd, safeFeature, sessionId, liveBaseline, options);
    draftWorkspace = workspace.draftWorkspace;
    isolation = workspace.isolation;
    const workspaceRoot = resolveWorkspacePath(cwd, draftWorkspace.path);
    await syncDraftSpecsToWorkspace(cwd, workspaceRoot);
    draftSpecPath = join(workspaceRoot, toRelative(cwd, liveDraftSpecPath));
  }

  const state = {
    schemaVersion: STATE_SCHEMA_VERSION,
    sessionId,
    cwd,
    surface: options.surface || process.env.DRAFTKIT_SURFACE || "codex",
    mode: "draft",
    phase: "open",
    feature: safeFeature,
    preview,
    draftPreview: preview,
    livePreview,
    process: processInfo,
    liveBaseline,
    draftWorkspace,
    isolation,
    draftSpec: toRelative(draftWorkspace ? resolveWorkspacePath(cwd, draftWorkspace.path) : cwd, draftSpecPath),
    approvedSpec: approvedInfo.approvedSpec,
    snapshotId: approvedInfo.snapshotId,
    approvalStatus: approvedInfo.approvalStatus,
    checks: [],
    lastAction: "draft-open",
    lastUpdatedAt: now,
    sessionStatePath: toRelative(cwd, sessionStatePath(cwd, sessionId)),
    next: nextActions({ mode: "draft", approval: approvedInfo.approvalStatus, feature: safeFeature })
  };

  const stateValidation = validateDraftkitState(state);
  if (!stateValidation.valid) {
    throw new Error(`DraftKit state is invalid: ${stateValidation.errors.join("; ")}`);
  }

  await writeSessionState(cwd, state);
  await appendHistory(paths, {
    type: action === "resumed" ? "draft-open-resume" : "draft-open",
    feature: safeFeature,
    sessionId,
    at: now,
    preview,
    liveBaseline,
    draftWorkspace,
    isolation
  });

  return {
    command: "draft-open",
    action,
    mode: "draft",
    state: "active",
    feature: safeFeature,
    preview,
    draftPreview: preview,
    livePreview,
    liveBaseline,
    draftWorkspace,
    isolation,
    draftSpec: toRelative(draftWorkspace ? resolveWorkspacePath(cwd, draftWorkspace.path) : cwd, draftSpecPath),
    approvedSpec: approvedInfo.approvedSpec,
    approval: approvedInfo.approvalStatus,
    snapshotId: approvedInfo.snapshotId,
    guardrails: "advisory",
    next: state.next
  };
}

export function draftPreviewPath(cwd, feature) {
  const safeFeature = normalizeFeature(feature);
  const exampleIndex = join(resolve(cwd), "examples", safeFeature, "index.html");
  return existsSync(exampleIndex) ? `/examples/${safeFeature}/` : `/draftkit/${safeFeature}/`;
}

export async function draftCancel(options = {}) {
  const cwd = resolve(options.cwd || process.cwd());
  const paths = draftkitPaths(cwd);
  const active = await readJsonIfExists(paths.activeState);
  const now = isoNow(options.now);

  if (!active) {
    return {
      command: "draft-cancel",
      mode: "live",
      state: "none",
      feature: null,
      stoppedProcess: false,
      cancellation: { blocked: false, reason: "no active draft session" },
      isolation: { status: "none", strategy: "none", discardedDraftWorkspace: false },
      preserved: [],
      next: ["agent behaves normally", "draft-open <feature>"]
    };
  }

  const sessionPathInfo = resolveSessionStatePath(cwd, active);
  if (!sessionPathInfo.valid) {
    return await blockedCancelResult(paths, active, now, sessionPathInfo.reason);
  }
  const sessionPath = sessionPathInfo.path;
  const state = (await readJsonIfExists(sessionPath)) || active;
  const workspaceValidation = await validateDraftWorkspaceIntegrity(cwd, state);
  if (!workspaceValidation.valid) return await blockedCancelResult(paths, state, now, workspaceValidation.reason);

  const stopped = await stopOwnedPreviewProcess(state.process, cwd, options);
  const specInfo = await inspectSpecs(cwd, state.feature);
  const preserved = [
    specInfo.draftSpec || state.draftSpec,
    specInfo.approvedSpec || state.approvedSpec
  ].filter(Boolean);
  const workspaceRemoval = await removeDraftWorkspace(cwd, state, options, workspaceValidation.workspacePath);
  const cancelled = {
    ...state,
    mode: "live",
    phase: "cancelled",
    isolation: {
      ...state.isolation,
      discardedDraftWorkspace: workspaceRemoval.discarded,
      discardReason: workspaceRemoval.reason
    },
    lastAction: "draft-cancel",
    lastUpdatedAt: now,
    next: [`draft-open ${state.feature || "<feature>"}`]
  };

  await writeJson(sessionPath, cancelled);
  await rm(paths.activeState, { force: true });
  await appendHistory(paths, {
    type: "draft-cancel",
    feature: state.feature || null,
    sessionId: state.sessionId || null,
    at: now,
    stoppedProcess: stopped.stopped,
    stopReason: stopped.reason,
    discardedDraftWorkspace: workspaceRemoval.discarded,
    discardReason: workspaceRemoval.reason
  });

  return {
    command: "draft-cancel",
    mode: "live",
    state: "inactive",
    feature: state.feature || null,
    stoppedProcess: stopped.stopped,
    stopReason: stopped.reason,
    cancellation: {
      blocked: false,
      reason: "discarded isolated draft workspace",
      restoredBaseline: state.liveBaseline || null
    },
    isolation: {
      ...state.isolation,
      discardedDraftWorkspace: workspaceRemoval.discarded,
      discardReason: workspaceRemoval.reason
    },
    preserved,
    next: ["agent behaves normally", `draft-open ${state.feature || "<feature>"}`]
  };
}

export async function draftPlanToGoLive(feature, options = {}) {
  const cwd = resolve(options.cwd || process.cwd());
  const safeFeature = normalizeFeature(feature);
  const now = isoNow(options.now);
  const paths = draftkitPaths(cwd);
  await mkdir(paths.goLiveDir, { recursive: true });

  const approved = await loadApprovedSpec(cwd, safeFeature);
  const tasks = mapApprovedSpecToBackendTasks(approved.spec);
  const discovery = await discoverBackendBoundaries(cwd);
  const plan = createGoLivePlan({
    cwd,
    feature: safeFeature,
    approvedSpecPath: approved.path,
    spec: approved.spec,
    tasks,
    discovery,
    generatedAt: now
  });

  const planJsonPath = join(paths.goLiveDir, `${safeFeature}.plan.json`);
  const planMdPath = join(paths.goLiveDir, `${safeFeature}.plan.md`);
  await writeJson(planJsonPath, plan);
  await writeFile(planMdPath, renderPlanMarkdown(plan), "utf8");
  await appendHistory(paths, {
    type: "draft-plan-to-go-live",
    feature: safeFeature,
    sessionId: null,
    at: now,
    snapshotId: approved.spec.snapshotId,
    plan: toRelative(cwd, planJsonPath)
  });

  return {
    command: "draft-plan-to-go-live",
    mode: "live",
    feature: safeFeature,
    approval: "approved",
    snapshotId: approved.spec.snapshotId,
    planMarkdown: toRelative(cwd, planMdPath),
    planJson: toRelative(cwd, planJsonPath),
    backendTarget: plan.backendTarget,
    next: [`draft-implement-to-live ${safeFeature}`]
  };
}

export async function draftImplementToLive(feature, options = {}) {
  const cwd = resolve(options.cwd || process.cwd());
  const safeFeature = normalizeFeature(feature);
  const now = isoNow(options.now);
  const paths = draftkitPaths(cwd);
  await mkdir(paths.fixtureBackendFeaturesDir, { recursive: true });

  const approved = await loadApprovedSpec(cwd, safeFeature);
  const planPaths = {
    json: join(paths.goLiveDir, `${safeFeature}.plan.json`),
    markdown: join(paths.goLiveDir, `${safeFeature}.plan.md`)
  };

  let plan = await readJsonIfExists(planPaths.json);
  let createdPlan = false;
  if (!plan) {
    await draftPlanToGoLive(safeFeature, { cwd, now });
    plan = await readJson(planPaths.json);
    createdPlan = true;
  }

  if (plan.snapshotId !== approved.spec.snapshotId) {
    throw new Error(
      `Go-live plan snapshotId mismatch: plan has ${plan.snapshotId}, approved spec has ${approved.spec.snapshotId}`
    );
  }
  if (plan.approvedSpecPath !== toRelative(cwd, approved.path)) {
    throw new Error("Go-live plan approvedSpecPath does not match the approved spec path");
  }

  const implementation = {
    schemaVersion: 1,
    target: "fixture-backend-sandbox",
    feature: safeFeature,
    status: "implemented",
    implementedAt: now,
    approvedSpecPath: toRelative(cwd, approved.path),
    planPath: toRelative(cwd, planPaths.json),
    snapshotId: approved.spec.snapshotId,
    contracts: approved.spec.backendContracts.map((contract) => ({
      id: contract.id,
      operation: contract.operation,
      method: contract.method || "POST",
      path: contract.pathHint || null,
      requestShape: contract.requestShape || {},
      responseShape: contract.responseShape || {},
      failureModes: contract.failureModes || []
    })),
    source: {
      usesRuntimeStateForAuthorization: false,
      usesApprovedSnapshotOnly: true
    }
  };

  const implementationPath = join(paths.fixtureBackendFeaturesDir, `${safeFeature}.implementation.json`);
  await writeJson(implementationPath, implementation);
  await writeFixtureReadme(paths);
  await appendHistory(paths, {
    type: "draft-implement-to-live",
    feature: safeFeature,
    sessionId: null,
    at: now,
    snapshotId: approved.spec.snapshotId,
    implementation: toRelative(cwd, implementationPath),
    createdPlan
  });

  return {
    command: "draft-implement-to-live",
    mode: "live",
    feature: safeFeature,
    approval: "approved",
    snapshotId: approved.spec.snapshotId,
    planJson: toRelative(cwd, planPaths.json),
    createdPlan,
    implementation: toRelative(cwd, implementationPath),
    backendTarget: "fixture-backend-sandbox",
    next: ["run tests", "agent behaves normally"]
  };
}

export function validateDraftkitState(state) {
  const errors = [];
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { valid: false, errors: ["state must be an object"] };
  }
  if (state.schemaVersion !== STATE_SCHEMA_VERSION) errors.push("schemaVersion must be 1");
  for (const field of ["sessionId", "cwd", "surface", "mode", "phase", "lastAction", "lastUpdatedAt"]) {
    if (!state[field] || typeof state[field] !== "string") errors.push(`${field} must be a string`);
  }
  if (!["draft", "live"].includes(state.mode)) errors.push("mode must be draft or live");
  if (!["open", "cancelled", "planned", "implemented"].includes(state.phase)) {
    errors.push("phase must be open, cancelled, planned, or implemented");
  }
  if (state.feature !== null && state.feature !== undefined && !FEATURE_PATTERN.test(state.feature)) {
    errors.push("feature must be a lowercase slug");
  }
  if (!state.preview || typeof state.preview !== "object") errors.push("preview must be an object");
  if (state.preview && state.preview.url !== null && state.preview.url !== undefined && typeof state.preview.url !== "string") {
    errors.push("preview.url must be a string or null");
  }
  if (state.preview && state.preview.port !== null && state.preview.port !== undefined && !Number.isInteger(state.preview.port)) {
    errors.push("preview.port must be an integer or null");
  }
  if (state.process !== null && state.process !== undefined && typeof state.process !== "object") {
    errors.push("process must be an object or null");
  }
  if (!["missing", "unapproved", "approved", "invalid"].includes(state.approvalStatus)) {
    errors.push("approvalStatus must be missing, unapproved, approved, or invalid");
  }
  if (!Array.isArray(state.checks)) errors.push("checks must be an array");
  if (!Array.isArray(state.next)) errors.push("next must be an array");
  if (!state.draftSpec || typeof state.draftSpec !== "string") errors.push("draftSpec must be a string");
  if (state.approvedSpec !== null && state.approvedSpec !== undefined && typeof state.approvedSpec !== "string") {
    errors.push("approvedSpec must be a string or null");
  }
  if (state.snapshotId !== null && state.snapshotId !== undefined && typeof state.snapshotId !== "string") {
    errors.push("snapshotId must be a string or null");
  }
  if (!state.sessionStatePath || typeof state.sessionStatePath !== "string") {
    errors.push("sessionStatePath must be a string");
  }
  return { valid: errors.length === 0, errors };
}

async function resolveOpenFeature(feature, cwd, active) {
  if (feature) return normalizeFeature(feature);
  if (active?.feature && active?.mode === "draft" && active?.isolation?.separated && active?.draftWorkspace?.path) {
    const workspace = resolveWorkspacePath(cwd, active.draftWorkspace.path);
    if (existsSync(workspace)) return normalizeFeature(active.feature);
  }
  throw new Error("feature-slug-required: feature slug is required when no isolated active draft can be resumed");
}

async function captureLiveBaseline(cwd) {
  if (await isGitRepository(cwd)) {
    const [commit, tree, status] = await Promise.all([
      gitOutput(cwd, ["rev-parse", "HEAD"]),
      gitOutput(cwd, ["rev-parse", "HEAD^{tree}"]),
      gitStatusOutput(cwd)
    ]);
    return {
      type: "git",
      commit: commit.trim(),
      tree: tree.trim(),
      dirty: status.trim().length > 0,
      statusFingerprint: fingerprintText(status)
    };
  }

  return {
    type: "filesystem",
    fingerprint: await filesystemFingerprint(cwd),
    dirty: false
  };
}

async function inspectLiveMovement(cwd, baseline) {
  if (!baseline) {
    return {
      currentBaseline: null,
      staleReasons: ["live baseline is missing from DraftKit state"]
    };
  }

  try {
    if (baseline.type === "git") {
      if (!(await isGitRepository(cwd))) {
        return {
          currentBaseline: null,
          staleReasons: ["live baseline cannot be compared because the current workspace is not a git repository"]
        };
      }
      const [commit, tree, status] = await Promise.all([
        gitOutput(cwd, ["rev-parse", "HEAD"]),
        gitOutput(cwd, ["rev-parse", "HEAD^{tree}"]),
        gitStatusOutput(cwd)
      ]);
      const currentBaseline = {
        type: "git",
        commit: commit.trim(),
        tree: tree.trim(),
        dirty: status.trim().length > 0,
        statusFingerprint: fingerprintText(status)
      };
      const staleReasons = [];
      if (baseline.commit && currentBaseline.commit !== baseline.commit) {
        staleReasons.push(
          `live baseline moved from commit ${baseline.commit} to ${currentBaseline.commit}; choose refresh/rebase, continue stale, or cancel`
        );
      } else if (baseline.tree && currentBaseline.tree !== baseline.tree) {
        staleReasons.push("live baseline tree changed; choose refresh/rebase, continue stale, or cancel");
      }
      if ((baseline.statusFingerprint || "") !== currentBaseline.statusFingerprint) {
        staleReasons.push("live working tree changed since the draft baseline; choose refresh/rebase, continue stale, or cancel");
      }
      return { currentBaseline, staleReasons };
    }

    const currentBaseline = {
      type: "filesystem",
      fingerprint: await filesystemFingerprint(cwd),
      dirty: false
    };
    return {
      currentBaseline,
      staleReasons:
        currentBaseline.fingerprint === baseline.fingerprint
          ? []
          : ["live filesystem baseline changed; choose refresh/rebase, continue stale, or cancel"]
    };
  } catch (error) {
    return {
      currentBaseline: null,
      staleReasons: [`live baseline check failed: ${error.message}`]
    };
  }
}

async function ensureDraftWorkspace(cwd, feature, sessionId, liveBaseline, options) {
  const paths = draftkitPaths(cwd);
  const workspacePath = join(paths.workspacesDir, pathSegment(sessionId));
  await rm(workspacePath, { recursive: true, force: true });
  await mkdir(dirname(workspacePath), { recursive: true });

  if (liveBaseline.type === "git" && (await isGitRepository(cwd))) {
    try {
      await gitOutput(cwd, ["worktree", "add", "--detach", workspacePath, liveBaseline.commit]);
      await writeDraftWorkspaceMarker(workspacePath, { cwd, sessionId, feature });
      return {
        draftWorkspace: {
          path: toRelative(cwd, workspacePath),
          owner: "draftkit",
          feature
        },
        isolation: {
          status: "isolated",
          strategy: "git-worktree",
          separated: true,
          baselineCommit: liveBaseline.commit,
          limitation: liveBaseline.dirty
            ? "The draft worktree is based on the recorded commit; uncommitted live changes are preserved in live but not copied into the draft workspace."
            : null
        }
      };
    } catch (error) {
      await rm(workspacePath, { recursive: true, force: true });
      if (options.requireGitWorktree) throw error;
    }
  }

  await copyWorkspaceSnapshot(cwd, workspacePath);
  await writeDraftWorkspaceMarker(workspacePath, { cwd, sessionId, feature });
  return {
    draftWorkspace: {
      path: toRelative(cwd, workspacePath),
      owner: "draftkit",
      feature
    },
    isolation: {
      status: "isolated",
      strategy: "workspace-copy",
      separated: true,
      baselineFingerprint: liveBaseline.fingerprint || null,
      limitation: "Copy sandbox fallback is local filesystem isolation, not a git worktree."
    }
  };
}

async function blockedCancelResult(paths, state, now, reason) {
  await appendHistory(paths, {
    type: "draft-cancel-blocked",
    feature: state.feature || null,
    sessionId: state.sessionId || null,
    at: now,
    reason
  });
  return {
    command: "draft-cancel",
    mode: state.mode || "draft",
    state: "blocked",
    feature: state.feature || null,
    stoppedProcess: false,
    stopReason: "cancel blocked before stopping preview",
    cancellation: { blocked: true, reason },
    isolation: {
      ...(state.isolation || { strategy: "none", separated: false }),
      discardedDraftWorkspace: false
    },
    preserved: [],
    next: staleDecisionActions(state.feature)
  };
}

async function syncDraftSpecsToWorkspace(cwd, workspaceRoot) {
  const source = draftkitPaths(cwd).featuresDir;
  const target = draftkitPaths(workspaceRoot).featuresDir;
  if (!existsSync(source)) return;
  await copyDirectory(source, target);
}

async function removeDraftWorkspace(cwd, state, options, validatedWorkspacePath = null) {
  const workspacePath = validatedWorkspacePath || resolveWorkspacePath(cwd, state.draftWorkspace.path);
  if (!existsSync(workspacePath)) {
    return { discarded: true, reason: "draft workspace already absent" };
  }

  if (state.isolation?.strategy === "git-worktree" && (await isGitRepository(cwd))) {
    try {
      await gitOutput(cwd, ["worktree", "remove", "--force", workspacePath]);
      return { discarded: true, reason: "removed git worktree" };
    } catch (error) {
      if (!options.forceRemoveWorkspace) throw error;
    }
  }

  await rm(workspacePath, { recursive: true, force: true });
  return { discarded: true, reason: "removed draft workspace directory" };
}

async function validateDraftWorkspaceIntegrity(cwd, state) {
  if (!state.isolation?.separated || !state.draftWorkspace?.path) {
    return {
      valid: false,
      reason: state.isolation?.reason || "cannot separate draft edits from live work without an isolated draft workspace"
    };
  }
  if (state.draftWorkspace.owner !== "draftkit") {
    return { valid: false, reason: "draft workspace is not marked as DraftKit-owned" };
  }
  if (typeof state.draftWorkspace.path !== "string" || isAbsolute(state.draftWorkspace.path)) {
    return { valid: false, reason: "draft workspace path must be a relative DraftKit-owned path" };
  }

  const workspacePath = resolveWorkspacePath(cwd, state.draftWorkspace.path);
  const workspacesRoot = draftkitPaths(cwd).workspacesDir;
  const relToRoot = relative(workspacesRoot, workspacePath);
  if (!relToRoot || relToRoot.startsWith("..") || isAbsolute(relToRoot)) {
    return { valid: false, reason: "draft workspace path is outside DraftKit workspace storage" };
  }

  const expectedSegment = pathSegment(state.sessionId || "");
  const [actualSegment] = relToRoot.split(/[\\/]/);
  if (actualSegment !== expectedSegment) {
    return { valid: false, reason: "draft workspace path does not match the active DraftKit session" };
  }

  if (!existsSync(workspacePath)) {
    return { valid: false, reason: `draft workspace is missing: ${state.draftWorkspace.path}` };
  }

  const marker = await readJsonIfExists(join(workspacePath, DRAFT_WORKSPACE_MARKER));
  if (!marker) return { valid: false, reason: "draft workspace marker is missing" };
  if (marker.owner !== "draftkit") return { valid: false, reason: "draft workspace marker is not DraftKit-owned" };
  if (marker.sessionId !== state.sessionId) return { valid: false, reason: "draft workspace marker session does not match" };
  if (typeof marker.cwd !== "string" || resolve(marker.cwd) !== cwd) {
    return { valid: false, reason: "draft workspace marker cwd does not match" };
  }
  if (typeof marker.feature !== "string" || marker.feature !== state.feature) {
    return { valid: false, reason: "draft workspace marker feature does not match" };
  }

  return { valid: true, workspacePath };
}

async function writeDraftWorkspaceMarker(workspacePath, { cwd, sessionId, feature }) {
  await writeJson(join(workspacePath, DRAFT_WORKSPACE_MARKER), {
    owner: "draftkit",
    sessionId,
    feature,
    cwd,
    createdAt: new Date().toISOString()
  });
}

function draftWorkspaceAbsolutePath(state, cwd) {
  if (!state?.draftWorkspace?.path) return null;
  return resolveWorkspacePath(cwd, state.draftWorkspace.path);
}

function resolveWorkspacePath(cwd, workspacePath) {
  return resolve(cwd, workspacePath);
}

async function inspectLivePreview(cwd, state) {
  if (state?.livePreview?.url) {
    return {
      ...state.livePreview,
      healthy: await urlHealthy(state.livePreview.url)
    };
  }
  const url = `http://localhost:${DEFAULT_PORT}/`;
  const healthy = await urlHealthy(url);
  return {
    url: healthy ? url : null,
    port: DEFAULT_PORT,
    owner: healthy ? "external" : "none",
    healthy
  };
}

async function isGitRepository(cwd) {
  try {
    const output = await gitOutput(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return output.trim() === "true";
  } catch {
    return false;
  }
}

async function gitOutput(cwd, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout;
}

async function gitStatusOutput(cwd) {
  return gitOutput(cwd, [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ".",
    ":(exclude).draftspec/state",
    ":(exclude).draftspec/logs"
  ]);
}

async function copyWorkspaceSnapshot(sourceRoot, targetRoot) {
  await mkdir(targetRoot, { recursive: true });
  await copyDirectory(sourceRoot, targetRoot, (sourcePath) => {
    const rel = toRelative(sourceRoot, sourcePath);
    if (rel === ".") return true;
    return !isIgnoredForWorkspaceCopy(rel);
  });
}

async function copyDirectory(source, target, filter = () => true) {
  if (!filter(source)) return;
  await mkdir(target, { recursive: true });
  let entries = [];
  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    if (!filter(sourcePath)) continue;
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath, filter);
    } else if (entry.isFile()) {
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, await readFile(sourcePath));
    }
  }
}

function isIgnoredForWorkspaceCopy(rel) {
  return (
    rel === ".git" ||
    rel.startsWith(".git/") ||
    rel === "node_modules" ||
    rel.startsWith("node_modules/") ||
    rel === ".omx" ||
    rel.startsWith(".omx/") ||
    rel === ".draftspec/state" ||
    rel.startsWith(".draftspec/state/") ||
    rel === ".draftspec/logs" ||
    rel.startsWith(".draftspec/logs/")
  );
}

async function filesystemFingerprint(cwd) {
  const files = await listFiles(cwd, {
    ignoredDirs: new Set([".git", ".omx", "node_modules", ".draftspec/state", ".draftspec/logs"])
  });
  const parts = [];
  for (const file of files.sort()) {
    const rel = toRelative(cwd, file);
    const content = await readFile(file, "utf8").catch(() => "");
    parts.push(`${rel}\0${fingerprintText(content)}`);
  }
  return fingerprintText(parts.join("\n"));
}

function fingerprintText(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function ensurePreview(cwd, workspaceRoot, feature, sessionId, options) {
  const previewPath = draftPreviewPath(workspaceRoot, feature);
  const previewHost = options.previewHost || process.env.DRAFTKIT_PREVIEW_HOST || DEFAULT_PREVIEW_HOST;
  const urlForPort = (port) => `${previewOrigin(previewHost, port)}${previewPath}`;
  const livePreview = await inspectLivePreview(cwd, null);
  const paths = draftkitPaths(cwd);
  await mkdir(paths.logsDir, { recursive: true });

  let lastFailure = null;
  for (let port = DEFAULT_PORT; port < DEFAULT_PORT + 50; port += 1) {
    if (livePreview.owner !== "none" && livePreview.port === port) {
      lastFailure = `port ${port} is already serving the live preview`;
      continue;
    }
    if (await portInUse(port, previewHost)) {
      lastFailure = `port ${port} is unavailable on ${previewHost}`;
      continue;
    }

    const url = urlForPort(port);
    const attempt = startPreviewProcess({
      cwd,
      workspaceRoot,
      feature,
      sessionId,
      port,
      previewHost,
      paths,
      now: options.now
    });

    const identity = await waitForPreviewIdentity(
      attempt.processInfo,
      workspaceRoot,
      options.previewTimeoutMs || PREVIEW_TIMEOUT_MS
    );
    if (!identity.matched) {
      lastFailure = `port ${port} did not verify DraftKit identity: ${identity.reason}`;
      await stopPreviewAttempt(attempt.child);
      continue;
    }

    const routeHealthy = await waitForHealthyUrl(url, options.previewTimeoutMs || PREVIEW_TIMEOUT_MS);
    if (!routeHealthy) {
      lastFailure = `port ${port} verified identity but did not serve ${url}`;
      await stopPreviewAttempt(attempt.child);
      continue;
    }

    return {
      preview: { url, port, owner: "draftkit" },
      livePreview,
      process: attempt.processInfo
    };
  }

  throw new Error(
    `No DraftKit-owned preview port found from ${DEFAULT_PORT} to ${DEFAULT_PORT + 49}${
      lastFailure ? `; last failure: ${lastFailure}` : ""
    }`
  );
}

function startPreviewProcess({ cwd, workspaceRoot, feature, sessionId, port, previewHost, paths, now }) {
  const logPath = join(paths.logsDir, `${sessionId}-preview-${port}.log`);
  const fd = openSync(logPath, "a");
  const previewServerPath = join(dirname(__filename), "draftkit-preview-server.mjs");
  const previewToken = randomBytes(24).toString("hex");
  try {
    const child = spawn(process.execPath, [previewServerPath], {
      cwd: workspaceRoot,
      detached: true,
      env: {
        ...process.env,
        PORT: String(port),
        DRAFTKIT_PREVIEW_HOST: previewHost,
        DRAFTKIT_FEATURE: feature,
        DRAFTKIT_SESSION_ID: sessionId,
        DRAFTKIT_PREVIEW_TOKEN: previewToken
      },
      stdio: ["ignore", fd, fd]
    });
    child.unref();

    return {
      child,
      processInfo: {
        pid: child.pid,
        cwd: workspaceRoot,
        command: `${process.execPath} scripts/draftkit-preview-server.mjs`,
        startedAt: isoNow(now),
        startedBy: "draft-open",
        previewIdentity: {
          url: `${previewOrigin(previewHost, port)}/__draftkit/preview-identity`,
          token: previewToken,
          sessionId,
          feature,
          cwd: workspaceRoot,
          host: previewHost
        },
        logPath: toRelative(cwd, logPath)
      }
    };
  } finally {
    closeSync(fd);
  }
}

async function inspectPreview(state, cwd) {
  if (!state.preview?.url) return { healthy: "unknown", staleReason: null };
  if (state.process?.pid && !(await processAlive(state.process.pid))) {
    return { healthy: false, staleReason: `preview process ${state.process.pid} is not running` };
  }
  const expectedCwd = resolve(state.process?.cwd || cwd);
  const identity = await previewIdentityStatus(state.process, expectedCwd);
  const routeHealthy = await urlHealthy(state.preview.url);
  if (!routeHealthy) {
    return { healthy: false, staleReason: `preview URL is not healthy: ${state.preview.url}` };
  }
  if (identity.matched) return { healthy: true, staleReason: null };
  return {
    healthy: false,
    staleReason: `preview identity mismatch for ${state.preview.url}: ${identity.reason}`
  };
}

function portInUse(port, host = DEFAULT_PREVIEW_HOST) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", () => resolvePort(true));
    server.once("listening", () => {
      server.close(() => resolvePort(false));
    });
    server.listen(port, host);
  });
}

function previewOrigin(host, port) {
  return `http://${formatHost(host)}:${port}`;
}

function formatHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

async function waitForPreviewIdentity(processInfo, expectedCwd, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = { matched: false, reason: "identity endpoint has not responded" };
  while (Date.now() < deadline) {
    lastStatus = await previewIdentityStatus(processInfo, expectedCwd);
    if (lastStatus.matched) return lastStatus;
    if (processInfo?.pid && !(await processAlive(processInfo.pid))) {
      return {
        matched: false,
        reason: `preview process ${processInfo.pid} exited before identity verified: ${lastStatus.reason}`
      };
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  return lastStatus;
}

async function stopPreviewAttempt(child) {
  if (!child?.pid || !(await processAlive(child.pid))) return;
  try {
    process.kill(child.pid, "SIGTERM");
  } catch {
    return;
  }
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (!(await processAlive(child.pid))) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  try {
    process.kill(child.pid, "SIGKILL");
  } catch {}
}

async function waitForHealthyUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await urlHealthy(url)) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  return false;
}

async function urlHealthy(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(700) });
    return response.ok;
  } catch {
    return false;
  }
}

async function stopOwnedPreviewProcess(processInfo, cwd, options) {
  if (!processInfo?.pid) return { stopped: false, reason: "no DraftKit-owned process recorded" };
  if (processInfo.startedBy !== "draft-open") {
    return { stopped: false, reason: "recorded process was not started by draft-open" };
  }
  if (!(await processAlive(processInfo.pid))) return { stopped: false, reason: "recorded process is not running" };
  if (!(await processMatchesDraftkit(processInfo, cwd))) {
    return { stopped: false, reason: "recorded process identity did not match DraftKit preview" };
  }
  if (options.dryRunKill) return { stopped: false, reason: "dry run" };
  process.kill(processInfo.pid, "SIGTERM");
  return { stopped: true, reason: "stopped DraftKit-owned preview process" };
}

async function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function processMatchesDraftkit(processInfo, cwd) {
  const expectedCwd = resolve(processInfo.cwd || cwd);
  return (await previewIdentityStatus(processInfo, expectedCwd)).matched;
}

async function previewIdentityStatus(processInfo, expectedCwd) {
  if (!processInfo?.pid) return { matched: false, reason: "no preview process is recorded" };
  const identity = processInfo.previewIdentity;
  if (!identity?.url || !identity.token) {
    return { matched: false, reason: "recorded process has no preview identity token" };
  }
  let identityUrl;
  try {
    identityUrl = new URL(identity.url);
  } catch {
    return { matched: false, reason: "recorded preview identity URL is invalid" };
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(identityUrl.hostname)) {
    return { matched: false, reason: "preview identity URL is not local" };
  }
  if (identityUrl.pathname !== "/__draftkit/preview-identity") {
    return { matched: false, reason: "preview identity URL path is not the DraftKit endpoint" };
  }

  try {
    const response = await fetch(identityUrl, {
      headers: { "x-draftkit-preview-token": identity.token },
      signal: AbortSignal.timeout(700)
    });
    if (!response.ok) return { matched: false, reason: `identity endpoint returned HTTP ${response.status}` };
    const payload = await response.json();
    if (payload.owner !== "draftkit") return { matched: false, reason: "identity owner is not draftkit" };
    if (payload.pid !== processInfo.pid) return { matched: false, reason: "identity pid does not match recorded process" };
    if (payload.sessionId !== identity.sessionId) return { matched: false, reason: "identity sessionId does not match" };
    if (payload.feature !== identity.feature) return { matched: false, reason: "identity feature does not match" };
    if (resolve(payload.cwd) !== expectedCwd) {
      return { matched: false, reason: "identity cwd does not match draft workspace" };
    }
    return { matched: true, reason: null };
  } catch (error) {
    return { matched: false, reason: error.message };
  }
}

async function ensureDraftSpec(cwd, feature) {
  const paths = draftkitPaths(cwd);
  await mkdir(paths.featuresDir, { recursive: true });
  const draftSpecPath = join(paths.featuresDir, `${feature}.json`);
  if (existsSync(draftSpecPath)) return draftSpecPath;

  const graph = createDraftSpecScaffold(feature);
  await writeFile(draftSpecPath, `${stableStringify(graph)}\n`, "utf8");
  return draftSpecPath;
}

function createDraftSpecScaffold(feature) {
  const title = titleFromFeature(feature);
  const operation = `${feature.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase())}DraftSave`;
  const graph = createSpecGraph({
    feature,
    title,
    description:
      "Workflow scaffold for an unapproved feature. Replace scaffold entries with clicked-through UI, state, fixture, and follow-through details as the feature evolves."
  });

  addUiLocation(graph, {
    id: "draft-host",
    location: `draftkit.${feature}.host`,
    type: "route",
    label: `${title} workflow`
  });
  addState(graph, { id: "scaffold", label: "Workflow scaffold created" });
  addState(graph, { id: "reviewing", label: "Workflow ready for review" });
  addFixture(graph, {
    id: "draft.fixture",
    kind: "draft-data",
    source: "local-fixture"
  });
  addBackendContract(graph, {
    id: "draftSave",
    operation,
    method: "POST",
    pathHint: `/draftkit/${feature}/save`,
    requestShape: { feature: "string", changes: "object" },
    responseShape: { accepted: "boolean", snapshotCandidate: "string" },
    failureModes: ["validation_error"]
  });
  recordAction(graph, {
    id: "open-draft-host",
    from: "*",
    event: "draftkit.open",
    to: "reviewing",
    ui: "draft-host",
    backendContract: "draftSave"
  });

  return graph;
}

async function inspectSpecs(cwd, feature) {
  if (!feature) {
    return {
      draftSpec: null,
      draftSpecValid: false,
      approvedSpec: null,
      approvalStatus: "missing",
      snapshotId: null
    };
  }

  const paths = draftkitPaths(cwd);
  const draftPath = join(paths.featuresDir, `${feature}.json`);
  const approvedPath = join(paths.featuresDir, `${feature}.approved.json`);
  const draft = await readJsonIfExists(draftPath);
  const approved = await readJsonIfExists(approvedPath);
  const draftValidation = draft ? validateSpecGraph(draft) : { valid: false };

  if (!approved) {
    return {
      draftSpec: existsSync(draftPath) ? toRelative(cwd, draftPath) : null,
      draftSpecValid: draftValidation.valid,
      approvedSpec: null,
      approvalStatus: draft ? "unapproved" : "missing",
      snapshotId: null
    };
  }

  const approvedValidation = validateSpecGraph(approved);
  return {
    draftSpec: existsSync(draftPath) ? toRelative(cwd, draftPath) : null,
    draftSpecValid: draftValidation.valid,
    approvedSpec: toRelative(cwd, approvedPath),
    approvalStatus: approvedValidation.valid && approved.status === "approved" && approved.snapshotId ? "approved" : "invalid",
    snapshotId: approved.snapshotId || null
  };
}

async function inspectDraftSessionSpecs(liveCwd, specRoot, feature) {
  const draftInfo = await inspectSpecs(specRoot, feature);
  if (resolve(specRoot) === resolve(liveCwd)) return draftInfo;

  const liveInfo = await inspectSpecs(liveCwd, feature);
  return {
    ...draftInfo,
    approvedSpec: liveInfo.approvedSpec || draftInfo.approvedSpec,
    approvalStatus: liveInfo.approvalStatus !== "missing" ? liveInfo.approvalStatus : draftInfo.approvalStatus,
    snapshotId: liveInfo.snapshotId || draftInfo.snapshotId
  };
}

async function loadApprovedSpec(cwd, feature) {
  normalizeFeature(feature);
  const paths = draftkitPaths(cwd);
  const approvedPath = join(paths.featuresDir, `${feature}.approved.json`);
  const spec = await readJsonIfExists(approvedPath);
  if (!spec) {
    throw new Error(`Live integration requires an approved spec: ${toRelative(cwd, approvedPath)}`);
  }
  const validation = validateSpecGraph(spec);
  if (!validation.valid) {
    throw new Error(`Approved spec is invalid: ${validation.errors.join("; ")}`);
  }
  if (spec.status !== "approved" || !spec.snapshotId) {
    throw new Error("Live integration requires status:\"approved\" and snapshotId");
  }
  return { path: approvedPath, spec };
}

async function discoverBackendBoundaries(cwd) {
  const files = await listFiles(cwd, {
    ignoredDirs: new Set([".git", ".omx", ".codex", "node_modules", ".draftspec/state", ".draftspec/logs"])
  });
  const rels = files.map((file) => toRelative(cwd, file));
  const byPattern = (patterns) => rels.filter((file) => patterns.some((pattern) => pattern.test(file))).sort();
  const backendFiles = byPattern([
    /(^|\/)(server|backend|api|routes|controllers|handlers)\//,
    /(^|\/)(server|backend|api|routes|controller|handler)[^/]*\.(mjs|js|ts)$/
  ]);
  const databaseFiles = byPattern([/(^|\/)(db|database|migrations|schema)\//, /(db|database|schema|migration).*\.(mjs|js|ts|sql)$/]);
  const serviceFiles = byPattern([/(^|\/)(services|service)\//, /service.*\.(mjs|js|ts)$/]);
  const testFiles = byPattern([/(^|\/)(test|tests)\//, /\.test\.(mjs|js|ts)$/]);
  const productionBackendFiles = backendFiles.filter(
    (file) => !file.startsWith("src/draftkit/") && !file.startsWith("tests/") && !file.startsWith("scripts/")
  );
  const productionDatabaseFiles = databaseFiles.filter((file) => !file.startsWith("tests/") && !file.startsWith("scripts/"));
  const productionServiceFiles = serviceFiles.filter((file) => !file.startsWith("tests/") && !file.startsWith("scripts/"));

  return {
    backendFiles,
    productionBackendFiles,
    databaseFiles,
    productionDatabaseFiles,
    serviceFiles,
    productionServiceFiles,
    testFiles,
    hasProductionBackendTarget:
      productionBackendFiles.length > 0 || productionDatabaseFiles.length > 0 || productionServiceFiles.length > 0
  };
}

function createGoLivePlan({ cwd, feature, approvedSpecPath, spec, tasks, discovery, generatedAt }) {
  const usesFixture = !discovery.hasProductionBackendTarget;
  return {
    schemaVersion: 1,
    feature,
    status: "planned",
    generatedAt,
    approvedSpecPath: toRelative(cwd, approvedSpecPath),
    snapshotId: spec.snapshotId,
    backendTarget: usesFixture
      ? {
          type: "fixture-backend-sandbox",
          path: "fixtures/backend-sandbox/",
          reason: "No production backend/API/database target was detected in this repository."
        }
      : {
          type: "production-backend",
          path: null,
          reason: "Repository contains backend-like files; inspect before editing."
        },
    summary: {
      title: spec.title,
      description: spec.description,
      uiLocations: spec.ui.map((ui) => ui.id),
      states: spec.states.map((state) => state.id),
      actions: spec.actions.map((action) => action.id)
    },
    contracts: spec.backendContracts.map((contract) => ({
      id: contract.id,
      operation: contract.operation,
      method: contract.method || "POST",
      path: contract.pathHint || null,
      requestShape: contract.requestShape || {},
      responseShape: contract.responseShape || {},
      failureModes: contract.failureModes || []
    })),
    mappedTasks: tasks.tasks,
    discovery,
    databaseImplications:
      spec.backendContracts.length > 0
        ? ["Fixture backend stores contract-level behavior only; production persistence remains a future adapter task."]
        : [],
    apiImplications: spec.backendContracts.map((contract) => `${contract.method || "POST"} ${contract.pathHint || contract.operation}`),
    testPlan: [
      "Validate approved spec snapshot before planning or implementation.",
      "Reject stale plans when snapshotId differs from the approved spec.",
      "Exercise fixture backend success and requested failure modes."
    ],
    risks: [
      "Repo has no production backend target; generated implementation is intentionally fixture-backed.",
      "Do not treat runtime DraftKit state as authorization for backend edits.",
      "Do not add duplicate production routes without adapter-specific discovery."
    ],
    implementationOrder: [
      "Load and validate approved .draftspec snapshot.",
      "Confirm plan snapshotId matches approved snapshotId.",
      "Write fixture backend implementation artifact from approved contracts.",
      "Run DraftKit tests and spec validation."
    ]
  };
}

function renderPlanMarkdown(plan) {
  const contracts = plan.contracts
    .map((contract) => `- ${contract.id}: ${contract.method} ${contract.path || contract.operation}`)
    .join("\n");
  const tests = plan.testPlan.map((item) => `- ${item}`).join("\n");
  const risks = plan.risks.map((item) => `- ${item}`).join("\n");
  const order = plan.implementationOrder.map((item, index) => `${index + 1}. ${item}`).join("\n");

  return `# DraftKit Go-Live Plan: ${plan.feature}

Generated: ${plan.generatedAt}
Approved snapshot: ${plan.snapshotId}
Approved spec: \`${plan.approvedSpecPath}\`
Backend target: \`${plan.backendTarget.type}\`

## Behavior Summary

${plan.summary.description || plan.summary.title}

UI locations: ${plan.summary.uiLocations.join(", ") || "none"}
States: ${plan.summary.states.join(", ") || "none"}
Actions: ${plan.summary.actions.join(", ") || "none"}

## Backend Contracts

${contracts || "- No backend contracts found."}

## Repository Boundaries

- Production backend target detected: ${plan.discovery.hasProductionBackendTarget ? "yes" : "no"}
- Backend-like files: ${plan.discovery.backendFiles.length}
- Database files: ${plan.discovery.databaseFiles.length}
- Service files: ${plan.discovery.serviceFiles.length}
- Test files: ${plan.discovery.testFiles.length}

## Database Implications

${plan.databaseImplications.map((item) => `- ${item}`).join("\n") || "- None detected."}

## API Implications

${plan.apiImplications.map((item) => `- ${item}`).join("\n") || "- None detected."}

## Test Plan

${tests}

## Risks And Open Questions

${risks}

## Implementation Order

${order}
`;
}

async function writeFixtureReadme(paths) {
  const readmePath = join(paths.fixtureBackendDir, "README.md");
  if (existsSync(readmePath)) return;
  await mkdir(paths.fixtureBackendDir, { recursive: true });
  await writeFile(
    readmePath,
    `# DraftKit Backend Sandbox

This directory is a fixture backend target for repositories that do not yet have a production backend/API/database boundary.

\`draft-implement-to-live\` writes approved-contract implementation artifacts under \`features/\`. These files are not runtime state; they are reviewable fixture outputs tied to approved \`.draftspec\` snapshot IDs.
`,
    "utf8"
  );
}

async function listFiles(root, { ignoredDirs }) {
  const found = [];
  await walk(root);
  return found;

  async function walk(dir) {
    const rel = toRelative(root, dir);
    if (rel !== "." && ignoredDirs.has(rel)) return;
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = join(dir, entry.name);
      const fileRel = toRelative(root, file);
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(fileRel)) await walk(file);
      } else if (entry.isFile()) {
        found.push(file);
      }
    }
  }
}

function nextActions({ stale = false, mode, approval, feature }) {
  if (stale) return staleDecisionActions(feature);
  if (mode !== "draft") return ["draft-open <feature>"];
  if (approval === "approved") {
    return ["draft-status", "draft-review", "draft-cancel", `draft-plan-to-go-live ${feature}`, `draft-implement-to-live ${feature}`];
  }
  return ["draft-status", "draft-review", "draft-approve", "draft-cancel"];
}

function staleDecisionActions(feature) {
  const safeFeature = feature || "<feature>";
  return [
    `choose refresh/rebase for ${safeFeature}`,
    `choose continue stale for ${safeFeature}`,
    "draft-cancel",
    "draft-status"
  ];
}

async function ensureRuntimeDirs(paths) {
  await mkdir(paths.featuresDir, { recursive: true });
  await mkdir(paths.sessionsDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });
}

async function writeSessionState(cwd, state) {
  const sessionPath = sessionStatePath(cwd, state.sessionId);
  const paths = draftkitPaths(cwd);
  await mkdir(dirname(sessionPath), { recursive: true });
  await mkdir(dirname(paths.activeState), { recursive: true });
  await writeJson(sessionPath, state);
  await writeJson(paths.activeState, state);
}

async function appendHistory(paths, event) {
  await mkdir(paths.logsDir, { recursive: true });
  await appendFile(paths.historyLog, `${JSON.stringify(event)}\n`, "utf8");
}

function sessionStatePath(cwd, sessionId) {
  return join(cwd, ".draftspec", "state", "sessions", pathSegment(sessionId), "draftkit-state.json");
}

function resolveSessionStatePath(cwd, state) {
  if (!state?.sessionId || typeof state.sessionId !== "string") {
    return {
      valid: false,
      path: sessionStatePath(cwd, "missing-session"),
      reason: "active state is missing a valid sessionId"
    };
  }

  const expected = resolve(sessionStatePath(cwd, state.sessionId));
  if (!state.sessionStatePath) return { valid: true, path: expected, reason: null };
  if (typeof state.sessionStatePath !== "string" || isAbsolute(state.sessionStatePath)) {
    return {
      valid: false,
      path: expected,
      reason: "session state path must be a relative DraftKit session path"
    };
  }

  const actual = resolve(cwd, state.sessionStatePath);
  if (actual !== expected) {
    return {
      valid: false,
      path: expected,
      reason: "session state path does not match the active DraftKit session"
    };
  }
  return { valid: true, path: expected, reason: null };
}

function normalizeFeature(feature) {
  if (!feature || !FEATURE_PATTERN.test(feature)) {
    throw new Error("Feature must be a lowercase slug, for example board-columns");
  }
  return feature;
}

function pathSegment(value) {
  const safe = String(value || "session")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .slice(0, 120)
    .replace(/^-+|-+$/g, "");
  return safe || "session";
}

function titleFromFeature(feature) {
  return feature
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toRelative(cwd, path) {
  const rel = relative(cwd, path);
  return (rel || ".").replace(/\\/g, "/");
}

function isoNow(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonIfExists(path) {
  try {
    await access(path);
    return await readJson(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${stableStringify(value)}\n`, "utf8");
}

function formatResult(result) {
  const lines = [];
  lines.push(`mode: ${result.mode}`);
  if (result.state) lines.push(`state: ${result.state}`);
  lines.push(`feature: ${result.feature || "none"}`);
  if (result.preview) lines.push(`preview: ${result.preview.url || "none"}`);
  if (result.draftPreview) lines.push(`draftPreview: ${result.draftPreview.url || "none"}`);
  if (result.livePreview) lines.push(`livePreview: ${result.livePreview.url || "none"}`);
  if (result.liveBaseline) {
    lines.push(
      `liveBaseline: ${result.liveBaseline.type || "unknown"} ${result.liveBaseline.commit || result.liveBaseline.fingerprint || "unknown"}`
    );
  }
  if (result.currentLiveBaseline) {
    lines.push(
      `currentLiveBaseline: ${result.currentLiveBaseline.type || "unknown"} ${result.currentLiveBaseline.commit || result.currentLiveBaseline.fingerprint || "unknown"}`
    );
  }
  if (result.draftWorkspace) lines.push(`draftWorkspace: ${result.draftWorkspace.path || "none"}`);
  if (result.isolation) {
    lines.push(
      `isolation: ${result.isolation.status || "unknown"} (${result.isolation.strategy || "unknown"})`
    );
    if (result.isolation.limitation) lines.push(`isolationLimitation: ${result.isolation.limitation}`);
    if ("discardedDraftWorkspace" in result.isolation) {
      lines.push(`discardedDraftWorkspace: ${result.isolation.discardedDraftWorkspace}`);
    }
  }
  if ("approval" in result) lines.push(`approval: ${result.approval}`);
  if (result.snapshotId) lines.push(`snapshotId: ${result.snapshotId}`);
  if (result.draftSpec) lines.push(`draftSpec: ${result.draftSpec}`);
  if (result.approvedSpec) lines.push(`approvedSpec: ${result.approvedSpec}`);
  if (result.planMarkdown) lines.push(`planMarkdown: ${result.planMarkdown}`);
  if (result.planJson) lines.push(`planJson: ${result.planJson}`);
  if (result.implementation) lines.push(`implementation: ${result.implementation}`);
  if (result.guardrails) lines.push(`guardrails: ${result.guardrails}`);
  if (result.staleReasons?.length) lines.push(`staleReasons: ${result.staleReasons.join("; ")}`);
  if (result.preserved?.length) lines.push(`preserved: ${result.preserved.join(", ")}`);
  if ("stoppedProcess" in result) lines.push(`stoppedProcess: ${result.stoppedProcess}`);
  if (result.stopReason) lines.push(`stopReason: ${result.stopReason}`);
  if (result.cancellation) {
    lines.push(`cancellationBlocked: ${result.cancellation.blocked}`);
    if (result.cancellation.reason) lines.push(`cancellationReason: ${result.cancellation.reason}`);
  }
  if (result.backendTarget) {
    lines.push(
      `backendTarget: ${typeof result.backendTarget === "string" ? result.backendTarget : result.backendTarget.type}`
    );
  }
  lines.push(`next: ${(result.next || []).join(", ") || "none"}`);
  return lines.join("\n");
}

async function main(argv) {
  const [command, maybeFeature, ...rest] = argv;
  const json = rest.includes("--json") || maybeFeature === "--json";
  const noPreview = rest.includes("--no-preview") || maybeFeature === "--no-preview";
  const feature = maybeFeature && !maybeFeature.startsWith("--") ? maybeFeature : undefined;

  let result;
  switch (command) {
    case "status":
      result = await draftStatus();
      break;
    case "open":
      result = await draftOpen(feature, { startPreview: !noPreview });
      break;
    case "cancel":
      result = await draftCancel();
      break;
    case "plan-to-go-live":
      result = await draftPlanToGoLive(feature);
      break;
    case "implement-to-live":
      result = await draftImplementToLive(feature);
      break;
    default:
      throw new Error(
        `Usage: node scripts/${basename(__filename)} <status|open|cancel|plan-to-go-live|implement-to-live> [feature] [--json]`
      );
  }

  console.log(json ? JSON.stringify(result, null, 2) : formatResult(result));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
