import test from "node:test";
import assert from "node:assert/strict";
import {
  approveSpecGraph,
  createBulkTaggingSpec,
  createSpecGraph,
  mapApprovedSpecToBackendTasks,
  recordAction
} from "../src/draftkit/index.js";

test("backend mapper refuses draft specs", () => {
  const draft = createBulkTaggingSpec();
  recordAction(draft, {
    id: "select-items",
    from: "*",
    event: "select.items",
    to: "selected",
    ui: "items-route"
  });

  assert.throws(() => mapApprovedSpecToBackendTasks(draft), /approved spec/);
});

test("backend mapper creates contract and rollback tasks", () => {
  const draft = createBulkTaggingSpec();
  recordAction(draft, {
    id: "select-items",
    from: "idle",
    event: "select.items",
    to: "selected"
  });
  recordAction(draft, {
    id: "bulk-tag-rollback",
    from: "saving",
    event: "backend.bulkApplyTags.failure",
    to: "rollback",
    backendContract: "bulkApplyTags",
    rollback: true
  });

  const approved = approveSpecGraph(draft, { approvedAt: "2026-07-02T00:00:00.000Z" });
  const mapped = mapApprovedSpecToBackendTasks(approved);

  assert.equal(mapped.feature, "bulk-tagging");
  assert.equal(mapped.tasks.some((task) => task.id === "backend:bulkApplyTags"), true);
  assert.equal(mapped.tasks.some((task) => task.id === "test:bulk-tag-rollback"), true);
});

test("backend mapper rejects tampered approved specs", () => {
  const draft = createBulkTaggingSpec();
  recordAction(draft, {
    id: "select-items",
    from: "*",
    event: "select.items",
    to: "selected"
  });
  const approved = approveSpecGraph(draft, { approvedAt: "2026-07-02T00:00:00.000Z" });
  approved.backendContracts[0].operation = "tampered";

  assert.throws(() => mapApprovedSpecToBackendTasks(approved), /snapshotId does not match/);
});

test("backend mapper returns no backend tasks for approved UI-only specs", () => {
  const approved = approveSpecGraph(createUiOnlyTaskBoardSpec(), {
    approvedAt: "2026-07-02T00:00:00.000Z"
  });

  const mapped = mapApprovedSpecToBackendTasks(approved);

  assert.equal(mapped.feature, "task-board");
  assert.equal(mapped.snapshotId, approved.snapshotId);
  assert.deepEqual(mapped.tasks, []);
});

test("backend mapper creates a deferred integration task for deferred backend hints", () => {
  const draft = createUiOnlyTaskBoardSpec();
  draft.backendContracts.push({
    id: "persistTaskStatus",
    current: "deferred",
    routeHint: "PATCH /tasks/:id/status"
  });
  const approved = approveSpecGraph(draft, {
    approvedAt: "2026-07-02T00:00:00.000Z"
  });

  const mapped = mapApprovedSpecToBackendTasks(approved);

  assert.deepEqual(mapped.tasks, [
    {
      id: "backend:persistTaskStatus",
      title: "Resolve deferred backend contract persistTaskStatus",
      snapshotId: approved.snapshotId,
      backendMode: "deferred",
      suggestedMethod: null,
      suggestedPath: "PATCH /tasks/:id/status",
      requestShape: {},
      responseShape: {},
      failureModes: []
    }
  ]);
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
