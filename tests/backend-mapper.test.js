import test from "node:test";
import assert from "node:assert/strict";
import {
  approveSpecGraph,
  createBulkTaggingSpec,
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
