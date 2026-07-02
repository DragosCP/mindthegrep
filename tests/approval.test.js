import test from "node:test";
import assert from "node:assert/strict";
import {
  approveSpecGraph,
  createBulkTaggingSpec,
  recordAction,
  validateSpecGraph
} from "../src/draftkit/index.js";

test("approval produces an immutable snapshot id", () => {
  const draft = createBulkTaggingSpec();
  recordAction(draft, {
    id: "select-items",
    from: "idle",
    event: "select.items",
    to: "selected"
  });

  const approved = approveSpecGraph(draft, { approvedAt: "2026-07-02T00:00:00.000Z" });

  assert.equal(approved.status, "approved");
  assert.equal(typeof approved.snapshotId, "string");
  assert.equal(approved.snapshotId.length, 16);
  assert.equal(validateSpecGraph(approved).valid, true);
});

test("approved specs fail validation when content is tampered", () => {
  const draft = createBulkTaggingSpec();
  recordAction(draft, {
    id: "select-items",
    from: "*",
    event: "select.items",
    to: "selected"
  });

  const approved = approveSpecGraph(draft, { approvedAt: "2026-07-02T00:00:00.000Z" });
  approved.backendContracts[0].pathHint = "/tampered";

  const validation = validateSpecGraph(approved);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /snapshotId does not match/);
});
