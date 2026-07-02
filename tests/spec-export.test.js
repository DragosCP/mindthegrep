import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stableStringify } from "../src/draftkit/index.js";
import { exportBulkTaggingSpec } from "../scripts/export-bulk-tagging-spec.mjs";

test("runtime replay exports the persisted bulk tagging draft spec", async () => {
  const persisted = JSON.parse(await readFile(".draftspec/features/bulk-tagging.json", "utf8"));
  const exported = await exportBulkTaggingSpec();

  assert.equal(stableStringify(exported), stableStringify(persisted));
});
