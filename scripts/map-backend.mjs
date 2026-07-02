#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { mapApprovedSpecToBackendTasks } from "../src/draftkit/index.js";

const [specPath] = process.argv.slice(2);
if (!specPath) {
  console.error("Usage: node scripts/map-backend.mjs <approved-spec.json>");
  process.exit(2);
}

const spec = JSON.parse(await readFile(specPath, "utf8"));
console.log(JSON.stringify(mapApprovedSpecToBackendTasks(spec), null, 2));
