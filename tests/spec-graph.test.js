import test from "node:test";
import assert from "node:assert/strict";
import {
  addBackendContract,
  approveSpecGraph,
  createBulkTaggingSpec,
  createSpecGraph,
  stableStringify,
  validateSpecGraph
} from "../src/draftkit/index.js";

test("bulk tagging spec is valid and deterministic", () => {
  const spec = createBulkTaggingSpec();
  spec.actions.push({
    id: "select-items",
    from: "idle",
    event: "select.items",
    to: "selected",
    ui: "items-route"
  });

  const validation = validateSpecGraph(spec);
  assert.equal(validation.valid, true, validation.errors.join("; "));
  assert.equal(stableStringify(spec), stableStringify(JSON.parse(stableStringify(spec))));
});

test("spec validation rejects missing ui and backend references", () => {
  const missingUi = createBulkTaggingSpec();
  missingUi.actions.push({
    id: "bad-ui",
    from: "idle",
    event: "click.missing",
    to: "selected",
    ui: "missing-ui"
  });

  assert.equal(validateSpecGraph(missingUi).valid, false);
  assert.match(validateSpecGraph(missingUi).errors.join("\n"), /unknown ui/);

  const missingBackend = createBulkTaggingSpec();
  missingBackend.actions.push({
    id: "bad-backend",
    from: "saving",
    event: "backend.missing",
    to: "rollback",
    backendContract: "missing-contract"
  });

  assert.equal(validateSpecGraph(missingBackend).valid, false);
  assert.match(validateSpecGraph(missingBackend).errors.join("\n"), /unknown backend contract/);
});

test("spec validation accepts UI-only drafts without backend contracts", () => {
  const draft = createUiOnlyTaskBoardSpec();

  const validation = validateSpecGraph(draft);

  assert.equal(validation.valid, true, validation.errors.join("; "));
});

test("spec validation accepts deferred-backend draft hints", () => {
  const draft = createUiOnlyTaskBoardSpec();
  addBackendContract(draft, {
    id: "persistTaskStatus",
    current: "deferred",
    routeHint: "PATCH /tasks/:id/status"
  });
  draft.actions.push({
    id: "persist-status-later",
    from: "moved",
    event: "backend.persistTaskStatus.deferred",
    to: "moved",
    backendContract: "persistTaskStatus"
  });

  const validation = validateSpecGraph(draft);

  assert.equal(validation.valid, true, validation.errors.join("; "));
});

test("addBackendContract rejects non-deferred contracts without operations", () => {
  const draft = createUiOnlyTaskBoardSpec();

  assert.throws(
    () => addBackendContract(draft, { id: "persistTaskStatus", routeHint: "PATCH /tasks/:id/status" }),
    /missing operation/
  );
});

test("spec validation rejects non-deferred backend contracts without operations", () => {
  const draft = createUiOnlyTaskBoardSpec();
  draft.backendContracts.push({
    id: "persistTaskStatus",
    routeHint: "PATCH /tasks/:id/status"
  });

  const validation = validateSpecGraph(draft);

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /missing operation/);
});

test("approved UI-only specs keep stable snapshot validation", () => {
  const approved = approveSpecGraph(createUiOnlyTaskBoardSpec(), {
    approvedAt: "2026-07-02T00:00:00.000Z"
  });

  assert.equal(validateSpecGraph(approved).valid, true);

  approved.ui[0].label = "Tampered";
  const validation = validateSpecGraph(approved);

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /snapshotId does not match/);
});

function createUiOnlyTaskBoardSpec() {
  const draft = createSpecGraph({
    feature: "task-board",
    title: "Task Board"
  });
  draft.ui.push({ id: "task-board", location: "/tasks", type: "section", label: "Task board" });
  draft.states.push({ id: "idle", label: "Tasks listed" }, { id: "moved", label: "Task moved locally" });
  draft.actions.push({
    id: "move-task",
    from: "idle",
    event: "drag.task",
    to: "moved",
    ui: "task-board"
  });
  draft.fixtures.push({ id: "task-statuses", kind: "localStorage" });
  return draft;
}
