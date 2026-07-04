#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, openSync } from "node:fs";
import {
  access,
  appendFile,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  writeFile
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

const DEFAULT_FEATURE = "bulk-tagging";
const DEFAULT_PORT = 5173;
const STATE_SCHEMA_VERSION = 1;
const PREVIEW_TIMEOUT_MS = 5000;
const FEATURE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const __filename = fileURLToPath(import.meta.url);

export function draftkitPaths(cwd = process.cwd()) {
  const draftspec = join(cwd, ".draftspec");
  return {
    cwd,
    draftspec,
    featuresDir: join(draftspec, "features"),
    goLiveDir: join(draftspec, "go-live"),
    stateDir: join(draftspec, "state"),
    sessionsDir: join(draftspec, "state", "sessions"),
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
    return {
      command: "draft-status",
      mode: "live",
      state: "none",
      feature: null,
      preview: { url: null, port: null, healthy: "unknown" },
      draftSpec: null,
      approvedSpec: null,
      approval: "none",
      snapshotId: null,
      stale: false,
      staleReasons: [],
      checks: [],
      next: [`draft-open <feature>`, `draft-open ${DEFAULT_FEATURE}`]
    };
  }

  const sessionPath = resolve(cwd, active.sessionStatePath || sessionStatePath(cwd, active.sessionId));
  const sessionState = await readJsonIfExists(sessionPath);
  const state = sessionState || active;
  const staleReasons = [];

  if (!sessionState) staleReasons.push("active mirror references missing session state");

  const validation = validateDraftkitState(state);
  if (!validation.valid) staleReasons.push(...validation.errors);
  if (state.cwd && resolve(state.cwd) !== cwd) staleReasons.push("state cwd does not match current cwd");

  const specInfo = await inspectSpecs(cwd, state.feature);
  const preview = await inspectPreview(state, cwd);
  if (preview.staleReason) staleReasons.push(preview.staleReason);

  const stale = staleReasons.length > 0;
  const approval = specInfo.approvalStatus;

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
  const safeFeature = normalizeFeature(feature);
  const paths = draftkitPaths(cwd);
  await ensureRuntimeDirs(paths);
  const draftSpecPath = await ensureDraftSpec(cwd, safeFeature);
  const approvedInfo = await inspectSpecs(cwd, safeFeature);
  const existingStatus = await draftStatus({ cwd });
  const existingActive = await readJsonIfExists(paths.activeState);
  const now = isoNow(options.now);
  const sessionId =
    options.sessionId ||
    (existingActive?.feature === safeFeature && existingActive?.sessionId) ||
    process.env.DRAFTKIT_SESSION_ID ||
    process.env.CODEX_SESSION_ID ||
    process.env.OMX_SESSION_ID ||
    `draftkit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let action = "created";
  let preview = { url: null, port: null, owner: "none" };
  let processInfo = null;

  if (existingActive?.feature === safeFeature && existingStatus.state === "active") {
    action = "resumed";
    preview = existingActive.preview || preview;
    processInfo = existingActive.process || null;
  } else if (options.startPreview !== false) {
    const started = await ensurePreview(cwd, safeFeature, sessionId, options);
    preview = started.preview;
    processInfo = started.process;
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
    process: processInfo,
    draftSpec: toRelative(cwd, draftSpecPath),
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
    preview
  });

  return {
    command: "draft-open",
    action,
    mode: "draft",
    state: "active",
    feature: safeFeature,
    preview,
    draftSpec: toRelative(cwd, draftSpecPath),
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
      preserved: [],
      next: ["agent behaves normally", `draft-open ${DEFAULT_FEATURE}`]
    };
  }

  const sessionPath = resolve(cwd, active.sessionStatePath || sessionStatePath(cwd, active.sessionId));
  const state = (await readJsonIfExists(sessionPath)) || active;
  const stopped = await stopOwnedPreviewProcess(state.process, cwd, options);
  const specInfo = await inspectSpecs(cwd, state.feature);
  const preserved = [
    specInfo.draftSpec || state.draftSpec,
    specInfo.approvedSpec || state.approvedSpec
  ].filter(Boolean);
  const cancelled = {
    ...state,
    mode: "live",
    phase: "cancelled",
    lastAction: "draft-cancel",
    lastUpdatedAt: now,
    next: [`draft-open ${state.feature || DEFAULT_FEATURE}`]
  };

  await writeJson(sessionPath, cancelled);
  await rm(paths.activeState, { force: true });
  await appendHistory(paths, {
    type: "draft-cancel",
    feature: state.feature || null,
    sessionId: state.sessionId || null,
    at: now,
    stoppedProcess: stopped.stopped,
    stopReason: stopped.reason
  });

  return {
    command: "draft-cancel",
    mode: "live",
    state: "inactive",
    feature: state.feature || null,
    stoppedProcess: stopped.stopped,
    stopReason: stopped.reason,
    preserved,
    next: ["agent behaves normally", `draft-open ${state.feature || DEFAULT_FEATURE}`]
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

async function ensurePreview(cwd, feature, sessionId, options) {
  const previewPath = draftPreviewPath(cwd, feature);
  const urlForPort = (port) => `http://localhost:${port}${previewPath}`;
  const defaultUrl = urlForPort(DEFAULT_PORT);

  if (await urlHealthy(defaultUrl)) {
    return {
      preview: { url: defaultUrl, port: DEFAULT_PORT, owner: "external" },
      process: null
    };
  }

  const port = await findAvailablePort(DEFAULT_PORT);
  const url = urlForPort(port);
  const paths = draftkitPaths(cwd);
  await mkdir(paths.logsDir, { recursive: true });
  const logPath = join(paths.logsDir, `${sessionId}-preview.log`);
  const fd = openSync(logPath, "a");
  const child = spawn(process.execPath, ["scripts/dev-server.mjs"], {
    cwd,
    detached: true,
    env: { ...process.env, PORT: String(port), DRAFTKIT_FEATURE: feature },
    stdio: ["ignore", fd, fd]
  });
  child.unref();

  const healthy = await waitForHealthyUrl(url, options.previewTimeoutMs || PREVIEW_TIMEOUT_MS);
  if (!healthy) {
    throw new Error(`Preview server did not become healthy at ${url}`);
  }

  return {
    preview: { url, port, owner: "draftkit" },
    process: {
      pid: child.pid,
      cwd,
      command: `${process.execPath} scripts/dev-server.mjs`,
      startedAt: isoNow(options.now),
      startedBy: "draft-open",
      logPath: toRelative(cwd, logPath)
    }
  };
}

async function inspectPreview(state, cwd) {
  if (!state.preview?.url) return { healthy: "unknown", staleReason: null };
  const healthy = await urlHealthy(state.preview.url);
  if (healthy) return { healthy: true, staleReason: null };
  if (state.process?.pid && !(await processAlive(state.process.pid))) {
    return { healthy: false, staleReason: `preview process ${state.process.pid} is not running` };
  }
  return { healthy: false, staleReason: `preview URL is not healthy: ${state.preview.url}` };
}

async function findAvailablePort(start) {
  for (let port = start; port < start + 50; port += 1) {
    if (!(await portInUse(port))) return port;
  }
  throw new Error(`No available port found from ${start} to ${start + 49}`);
}

function portInUse(port) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", () => resolvePort(true));
    server.once("listening", () => {
      server.close(() => resolvePort(false));
    });
    server.listen(port, "127.0.0.1");
  });
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
  if (process.platform !== "linux") {
    return processInfo.cwd === cwd && String(processInfo.command || "").includes("scripts/dev-server.mjs");
  }
  try {
    const procCwd = await readlink(`/proc/${processInfo.pid}/cwd`);
    const cmdline = (await readFile(`/proc/${processInfo.pid}/cmdline`, "utf8")).replace(/\0/g, " ");
    return resolve(procCwd) === cwd && cmdline.includes("scripts/dev-server.mjs");
  } catch {
    return false;
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
      "DraftKit feature scaffold for an unapproved workflow. Replace scaffold entries with clicked-through UI, state, fixture, and backend contract details as the draft evolves."
  });

  addUiLocation(graph, {
    id: "draft-host",
    location: `draftkit.${feature}.host`,
    type: "route",
    label: `${title} draft host`
  });
  addState(graph, { id: "scaffold", label: "Draft scaffold created" });
  addState(graph, { id: "reviewing", label: "Draft ready for workflow review" });
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
  if (stale) return [`draft-open ${feature || DEFAULT_FEATURE}`, "draft-cancel", "draft-status"];
  if (mode !== "draft") return [`draft-open ${feature || DEFAULT_FEATURE}`];
  if (approval === "approved") {
    return ["draft-status", "draft-review", "draft-cancel", `draft-plan-to-go-live ${feature}`, `draft-implement-to-live ${feature}`];
  }
  return ["draft-status", "draft-review", "draft-approve", "draft-cancel"];
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
  return join(cwd, ".draftspec", "state", "sessions", sessionId, "draftkit-state.json");
}

function normalizeFeature(feature) {
  if (!feature || !FEATURE_PATTERN.test(feature)) {
    throw new Error("Feature must be a lowercase slug, for example bulk-tagging");
  }
  return feature;
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
      result = await draftOpen(feature || DEFAULT_FEATURE, { startPreview: !noPreview });
      break;
    case "cancel":
      result = await draftCancel();
      break;
    case "plan-to-go-live":
      result = await draftPlanToGoLive(feature || DEFAULT_FEATURE);
      break;
    case "implement-to-live":
      result = await draftImplementToLive(feature || DEFAULT_FEATURE);
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
