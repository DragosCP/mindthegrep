#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { approveSpecGraph, stableStringify } from "../src/draftkit/index.js";

const [inputPath, outputPath, approvedAt] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/approve-spec.mjs <draft.json> <approved.json> [approvedAt]");
  process.exit(2);
}

const draft = JSON.parse(await readFile(inputPath, "utf8"));
const approved = approveSpecGraph(draft, approvedAt ? { approvedAt } : undefined);
await writeFile(outputPath, `${stableStringify(approved)}\n`);

console.log(`approved: ${outputPath}`);
console.log(`snapshotId: ${approved.snapshotId}`);
