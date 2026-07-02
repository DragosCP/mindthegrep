#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (isCli()) {
  const [command, firstPath, secondPath] = process.argv.slice(2);

  if (!["snapshot", "check"].includes(command)) {
    usage();
  }

  try {
    if (command === "snapshot") {
      await snapshotProtectedFiles(firstPath, secondPath);
    } else {
      await checkProtectedFiles(firstPath);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

export async function snapshotProtectedFiles(configPath, snapshotPath) {
  if (!configPath || !snapshotPath) usage();

  const root = process.cwd();
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const files = normalizeConfiguredFiles(config);
  const snapshot = {
    version: 1,
    createdAt: new Date().toISOString(),
    files: []
  };

  for (const filePath of files) {
    const absolutePath = resolveInsideRoot(root, filePath);
    await assertFileExists(absolutePath, `${filePath} is configured as protected but does not exist`);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      throw new Error(`${filePath} is configured as protected but is not a file`);
    }
    snapshot.files.push({
      path: filePath,
      sha256: await hashFile(absolutePath),
      size: fileStat.size
    });
  }

  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${stableStringify(snapshot)}\n`);
  console.log(`snapshot: ${snapshotPath} (${snapshot.files.length} files)`);
}

export async function checkProtectedFiles(snapshotPath) {
  if (!snapshotPath) usage();

  const root = process.cwd();
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.files)) {
    throw new Error("protected-file snapshot must have version 1 and a files array");
  }

  const problems = [];
  for (const entry of snapshot.files) {
    const filePath = normalizeRelativePath(entry.path);
    const absolutePath = resolveInsideRoot(root, filePath);
    const exists = await fileExists(absolutePath);

    if (!exists) {
      problems.push(`${filePath}: missing`);
      continue;
    }

    const fileStat = await stat(absolutePath);
    const sha256 = await hashFile(absolutePath);
    if (sha256 !== entry.sha256 || fileStat.size !== entry.size) {
      problems.push(`${filePath}: changed`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`protected files changed:\n${problems.join("\n")}`);
  }

  console.log(`protected files unchanged: ${snapshot.files.length}`);
}

function normalizeConfiguredFiles(config) {
  if (!config || typeof config !== "object") {
    throw new Error("protected-file config must be an object");
  }
  if (!Array.isArray(config.files)) {
    throw new Error("protected-file config requires a files array");
  }
  return [...new Set(config.files.map(normalizeRelativePath))].sort();
}

function normalizeRelativePath(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new Error("protected file paths must be non-empty strings");
  }

  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`protected file path must stay inside the app root: ${filePath}`);
  }
  return normalized;
}

function resolveInsideRoot(root, filePath) {
  const absolutePath = path.resolve(root, filePath);
  const relativePath = path.relative(root, absolutePath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`protected file path must stay inside the app root: ${filePath}`);
  }
  return absolutePath;
}

async function assertFileExists(filePath, message) {
  if (!(await fileExists(filePath))) {
    throw new Error(message);
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function stableStringify(value) {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])])
  );
}

function isCli() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function usage() {
  console.error(`Usage:
  node scripts/check-protected-files.mjs snapshot <config.json> <snapshot.json>
  node scripts/check-protected-files.mjs check <snapshot.json>`);
  process.exit(2);
}
