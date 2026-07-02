#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import {
  createBulkTagFakeBackend,
  createBulkTaggingDraftFlow,
  stableStringify
} from "../src/draftkit/index.js";

export async function exportBulkTaggingSpec() {
  const backend = createBulkTagFakeBackend();
  const flow = await createBulkTaggingDraftFlow({ backend });
  const allIds = flow.items.map((item) => item.id);

  flow.selectItems(allIds);
  flow.openTagDialog();
  await flow.applyTag("priority");

  flow.selectItems(allIds);
  flow.openTagDialog();
  await flow.applyTag("priority", { simulateFailure: true });

  return flow.graph;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [outputPath] = process.argv.slice(2);
  const graph = await exportBulkTaggingSpec();
  const serialized = `${stableStringify(graph)}\n`;

  if (outputPath) {
    await writeFile(outputPath, serialized);
    console.log(`exported: ${outputPath}`);
  } else {
    process.stdout.write(serialized);
  }
}
