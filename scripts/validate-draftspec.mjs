#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (isCli()) {
  const specPaths = process.argv.slice(2);

  try {
    const paths = specPaths.length > 0 ? specPaths : await defaultSpecPaths();
    if (paths.length === 0) {
      console.log("valid: no .draftspec/features/*.json files found");
      process.exit(0);
    }

    let failed = false;
    for (const specPath of paths) {
      const spec = JSON.parse(await readFile(specPath, "utf8"));
      const result = validateDraftSpec(spec);
      if (!result.valid) {
        failed = true;
        console.error(`${specPath}:\n${result.errors.join("\n")}`);
      } else {
        console.log(`valid: ${specPath}`);
      }
    }

    if (failed) process.exit(1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

export function validateDraftSpec(graph) {
  const errors = [];

  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    return { valid: false, errors: ["spec must be an object"] };
  }

  if (graph.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof graph.feature !== "string" || graph.feature.trim() === "") errors.push("feature is required");
  if (!["draft", "approved"].includes(graph.status)) errors.push("status must be draft or approved");

  for (const key of ["ui", "states", "actions", "fixtures", "backendContracts"]) {
    if (!Array.isArray(graph[key])) errors.push(`${key} must be an array`);
  }

  const ui = Array.isArray(graph.ui) ? graph.ui : [];
  const states = Array.isArray(graph.states) ? graph.states : [];
  const actions = Array.isArray(graph.actions) ? graph.actions : [];
  const backendContracts = Array.isArray(graph.backendContracts) ? graph.backendContracts : [];
  const uiIds = collectIds(ui, "ui", errors);
  const stateIds = collectIds(states, "state", errors);
  const backendContractIds = collectIds(backendContracts, "backend contract", errors);

  for (const contract of backendContracts) {
    if (contract?.id && !contract.operation && !isDeferredBackendContract(contract)) {
      errors.push(`backend contract ${contract.id} missing operation`);
    }
  }

  if (ui.length === 0) errors.push("at least one ui location is required");
  if (actions.length === 0) errors.push("at least one action is required");

  for (const action of actions) {
    for (const field of ["id", "from", "event", "to"]) {
      if (!action?.[field]) errors.push(`action ${action?.id || "<unknown>"} missing ${field}`);
    }
    if (action?.from && action.from !== "*" && !stateIds.has(action.from)) {
      errors.push(`action ${action.id} references unknown from state ${action.from}`);
    }
    if (action?.to && !stateIds.has(action.to)) {
      errors.push(`action ${action.id} references unknown to state ${action.to}`);
    }
    if (action?.ui && !uiIds.has(action.ui)) {
      errors.push(`action ${action.id} references unknown ui ${action.ui}`);
    }
    if (action?.backendContract && !backendContractIds.has(action.backendContract)) {
      errors.push(`action ${action.id} references unknown backend contract ${action.backendContract}`);
    }
  }

  if (graph.status === "approved") {
    if (!graph.snapshotId) errors.push("approved specs require snapshotId");
    if (!graph.approvedAt) errors.push("approved specs require approvedAt");
    if (graph.snapshotId && graph.snapshotId !== snapshotId(graph)) {
      errors.push("approved spec snapshotId does not match content");
    }
  }

  return { valid: errors.length === 0, errors };
}

async function defaultSpecPaths() {
  const featuresDir = path.resolve(".draftspec/features");
  try {
    const entries = await readdir(featuresDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(featuresDir, entry.name))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function collectIds(entries, label, errors) {
  const ids = new Set();
  for (const entry of entries) {
    if (!entry?.id) {
      errors.push(`${label} missing id`);
      continue;
    }
    if (ids.has(entry.id)) errors.push(`duplicate ${label} id ${entry.id}`);
    ids.add(entry.id);
  }
  return ids;
}

function isDeferredBackendContract(contract) {
  return contract.mode === "deferred" || contract.current === "deferred" || contract.status === "deferred";
}

function snapshotId(graph) {
  const snapshotSource = copy(graph);
  delete snapshotSource.approvedAt;
  delete snapshotSource.snapshotId;
  snapshotSource.status = "draft";
  return hashString(stableStringify(snapshotSource));
}

function stableStringify(value) {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])])
  );
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashString(value) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

function isCli() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
