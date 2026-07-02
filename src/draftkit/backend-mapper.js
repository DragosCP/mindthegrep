import { validateSpecGraph } from "./spec-graph.js";

export function mapApprovedSpecToBackendTasks(spec) {
  const validation = validateSpecGraph(spec);
  if (!validation.valid) {
    throw new Error(`Cannot map invalid spec: ${validation.errors.join("; ")}`);
  }
  if (spec.status !== "approved") {
    throw new Error("Backend mapping requires an approved spec");
  }
  if (!spec.snapshotId) {
    throw new Error("Approved spec missing snapshotId");
  }

  const contractTasks = spec.backendContracts.map((contract) => ({
    id: `backend:${contract.id}`,
    title: contract.operation ? `Implement ${contract.operation}` : `Resolve deferred backend contract ${contract.id}`,
    snapshotId: spec.snapshotId,
    backendMode: isDeferredBackendContract(contract) ? "deferred" : "concrete",
    suggestedMethod: contract.method || (contract.operation ? "POST" : null),
    suggestedPath: contract.pathHint || contract.routeHint || contract.route || null,
    requestShape: contract.requestShape || {},
    responseShape: contract.responseShape || {},
    failureModes: contract.failureModes || []
  }));

  const rollbackActions = spec.actions
    .filter((action) => action.rollback && action.backendContract)
    .map((action) => ({
      id: `test:${action.id}`,
      title: `Cover rollback path for ${action.backendContract}`,
      snapshotId: spec.snapshotId,
      event: action.event
    }));

  return {
    feature: spec.feature,
    snapshotId: spec.snapshotId,
    tasks: [...contractTasks, ...rollbackActions]
  };
}

function isDeferredBackendContract(contract) {
  return contract.mode === "deferred" || contract.current === "deferred" || contract.status === "deferred";
}
