#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { validateSpecGraph } from "../src/draftkit/index.js";

const [specPath] = process.argv.slice(2);
if (!specPath) {
  console.error("Usage: node scripts/validate-spec.mjs <spec.json>");
  process.exit(2);
}

const spec = JSON.parse(await readFile(specPath, "utf8"));
const result = validateSpecGraph(spec);

if (!result.valid) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}

console.log(`valid: ${specPath}`);
