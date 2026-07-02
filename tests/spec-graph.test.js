import test from "node:test";
import assert from "node:assert/strict";
import { createBulkTaggingSpec, stableStringify, validateSpecGraph } from "../src/draftkit/index.js";

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
