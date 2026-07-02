export function createSpecGraph({ feature, title, description = "" }) {
  if (!feature) throw new Error("feature is required");

  return {
    schemaVersion: 1,
    feature,
    title: title || feature,
    description,
    status: "draft",
    ui: [],
    states: [],
    actions: [],
    fixtures: [],
    backendContracts: []
  };
}

export function addUiLocation(graph, location) {
  requireFields(location, ["id", "location", "type"], "ui location");
  upsertById(graph.ui, location);
  return graph;
}

export function addState(graph, state) {
  requireFields(state, ["id", "label"], "state");
  upsertById(graph.states, state);
  return graph;
}

export function addFixture(graph, fixture) {
  requireFields(fixture, ["id", "kind"], "fixture");
  upsertById(graph.fixtures, fixture);
  return graph;
}

export function addBackendContract(graph, contract) {
  requireFields(contract, ["id", "operation"], "backend contract");
  upsertById(graph.backendContracts, contract);
  return graph;
}

export function recordAction(graph, action) {
  requireFields(action, ["id", "from", "event", "to"], "action");
  if (!graph.actions.some((existing) => existing.id === action.id)) {
    graph.actions.push(copy(action));
  }
  return graph;
}

export function approveSpecGraph(graph, { approvedAt = new Date().toISOString() } = {}) {
  const validation = validateSpecGraph(graph);
  if (!validation.valid) {
    throw new Error(`Cannot approve invalid spec: ${validation.errors.join("; ")}`);
  }

  const approved = copy(graph);
  approved.status = "approved";
  approved.approvedAt = approvedAt;
  approved.snapshotId = snapshotId(graph);
  return approved;
}

export function snapshotId(graph) {
  const snapshotSource = copy(graph);
  delete snapshotSource.approvedAt;
  delete snapshotSource.snapshotId;
  snapshotSource.status = "draft";
  return hashString(stableStringify(snapshotSource));
}

export function validateSpecGraph(graph) {
  const errors = [];

  if (!graph || typeof graph !== "object") errors.push("spec must be an object");
  if (graph?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!graph?.feature) errors.push("feature is required");
  if (!["draft", "approved"].includes(graph?.status)) errors.push("status must be draft or approved");

  for (const key of ["ui", "states", "actions", "fixtures", "backendContracts"]) {
    if (!Array.isArray(graph?.[key])) errors.push(`${key} must be an array`);
  }

  const stateIds = new Set((graph?.states || []).map((state) => state.id));
  const uiIds = new Set((graph?.ui || []).map((ui) => ui.id));
  const backendContractIds = new Set((graph?.backendContracts || []).map((contract) => contract.id));

  for (const action of graph?.actions || []) {
    for (const field of ["id", "from", "event", "to"]) {
      if (!action[field]) errors.push(`action ${action.id || "<unknown>"} missing ${field}`);
    }
    if (action.from !== "*" && !stateIds.has(action.from)) {
      errors.push(`action ${action.id} references unknown from state ${action.from}`);
    }
    if (!stateIds.has(action.to)) {
      errors.push(`action ${action.id} references unknown to state ${action.to}`);
    }
    if (action.ui && !uiIds.has(action.ui)) {
      errors.push(`action ${action.id} references unknown ui ${action.ui}`);
    }
    if (action.backendContract && !backendContractIds.has(action.backendContract)) {
      errors.push(`action ${action.id} references unknown backend contract ${action.backendContract}`);
    }
  }

  if ((graph?.ui || []).length === 0) errors.push("at least one ui location is required");
  if ((graph?.actions || []).length === 0) errors.push("at least one action is required");
  if ((graph?.backendContracts || []).length === 0) errors.push("at least one backend contract is required");

  if (graph?.status === "approved") {
    if (!graph.snapshotId) errors.push("approved specs require snapshotId");
    if (!graph.approvedAt) errors.push("approved specs require approvedAt");
    if (graph.snapshotId && graph.snapshotId !== snapshotId(graph)) {
      errors.push("approved spec snapshotId does not match content");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function stableStringify(value) {
  return JSON.stringify(sortKeys(value), null, 2);
}

function upsertById(collection, value) {
  const index = collection.findIndex((item) => item.id === value.id);
  if (index === -1) {
    collection.push(copy(value));
  } else {
    collection[index] = { ...collection[index], ...copy(value) };
  }
}

function requireFields(value, fields, label) {
  for (const field of fields) {
    if (!value?.[field]) throw new Error(`${label} missing ${field}`);
  }
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
