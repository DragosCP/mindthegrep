import test from "node:test";
import assert from "node:assert/strict";
import {
  createBulkTagFakeBackend,
  createBulkTaggingDraftFlow,
  validateSpecGraph
} from "../src/draftkit/index.js";

test("bulk tagging succeeds with optimistic local update", async () => {
  const flow = await createBulkTaggingDraftFlow({ backend: createBulkTagFakeBackend() });

  flow.selectItems(flow.items.slice(0, 3).map((item) => item.id));
  flow.openTagDialog();
  const result = await flow.applyTag("priority");

  assert.equal(result.state, "success");
  assert.equal(result.selectedIds.length, 0);
  assert.equal(result.items.slice(0, 3).every((item) => item.tagIds.includes("priority")), true);
  assert.equal(validateSpecGraph(flow.graph).valid, true);
});

test("bulk tagging rolls back on simulated failure", async () => {
  const flow = await createBulkTaggingDraftFlow({ backend: createBulkTagFakeBackend() });
  const firstThree = flow.items.slice(0, 3).map((item) => item.id);

  flow.selectItems(firstThree);
  flow.openTagDialog();
  const result = await flow.applyTag("archive", { simulateFailure: true });

  assert.equal(result.state, "rollback");
  assert.equal(result.selectedIds.length, 0);
  assert.equal(result.items.slice(0, 3).some((item) => item.tagIds.includes("archive")), false);
  assert.equal(flow.graph.actions.some((action) => action.id === "bulk-tag-rollback"), true);
});

test("bulk tagging can be reused after terminal outcomes", async () => {
  const flow = await createBulkTaggingDraftFlow({ backend: createBulkTagFakeBackend() });
  const ids = flow.items.slice(0, 2).map((item) => item.id);

  flow.selectItems(ids);
  flow.openTagDialog();
  await flow.applyTag("priority");

  flow.selectItems(ids);
  assert.equal(flow.state, "selected");
  flow.openTagDialog();
  const result = await flow.applyTag("archive", { simulateFailure: true });

  assert.equal(result.state, "rollback");
});
