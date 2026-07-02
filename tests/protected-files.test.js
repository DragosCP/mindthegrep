import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const protectedScript = path.join(repoRoot, "scripts/check-protected-files.mjs");

test("protected-file check passes when protected files are unchanged", async () => {
  const appRoot = await createProtectedFixture();
  await snapshot(appRoot);

  const result = check(appRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /protected files unchanged: 3/);
});

test("protected-file check fails when database data changes", async () => {
  const appRoot = await createProtectedFixture();
  await snapshot(appRoot);

  await writeFile(path.join(appRoot, "data/tasks.json"), "[]\n");
  const result = check(appRoot);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /data\/tasks\.json: changed/);
});

test("protected-file check fails when backend code changes", async () => {
  const appRoot = await createProtectedFixture();
  await snapshot(appRoot);

  await writeFile(path.join(appRoot, "src/server.js"), "export const changed = true;\n");
  await writeFile(path.join(appRoot, "src/db.js"), "export const changed = true;\n");
  const result = check(appRoot);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /src\/db\.js: changed/);
  assert.match(result.stderr, /src\/server\.js: changed/);
});

test("protected-file check fails when protected file is deleted", async () => {
  const appRoot = await createProtectedFixture();
  await snapshot(appRoot);

  await rm(path.join(appRoot, "data/tasks.json"));
  const result = check(appRoot);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /data\/tasks\.json: missing/);
});

test("protected-file check ignores draft-only changes", async () => {
  const appRoot = await createProtectedFixture();
  await snapshot(appRoot);

  await mkdir(path.join(appRoot, ".draftspec/features"), { recursive: true });
  await writeFile(path.join(appRoot, ".draftspec/features/task-board.json"), "{}\n");
  await writeFile(path.join(appRoot, "public-index.html"), "<main>draft UI</main>\n");

  const result = check(appRoot);
  assert.equal(result.status, 0, result.stderr);
});

async function createProtectedFixture() {
  const appRoot = await mkdtemp(path.join(tmpdir(), "draftkit-protected-"));
  await mkdir(path.join(appRoot, "data"), { recursive: true });
  await mkdir(path.join(appRoot, "src"), { recursive: true });
  await mkdir(path.join(appRoot, ".draftspec"), { recursive: true });
  await writeFile(path.join(appRoot, "data/tasks.json"), "[{\"id\":1,\"title\":\"Task\"}]\n");
  await writeFile(path.join(appRoot, "src/db.js"), "export const db = true;\n");
  await writeFile(path.join(appRoot, "src/server.js"), "export const server = true;\n");
  await writeFile(
    path.join(appRoot, ".draftspec/protected-files.json"),
    `${JSON.stringify({ version: 1, files: ["data/tasks.json", "src/db.js", "src/server.js"] }, null, 2)}\n`
  );
  return appRoot;
}

async function snapshot(appRoot) {
  const result = runProtected(["snapshot", ".draftspec/protected-files.json", ".draftspec/protected-files.snapshot.json"], appRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(await readFile(path.join(appRoot, ".draftspec/protected-files.snapshot.json"), "utf8"));
}

function check(appRoot) {
  return runProtected(["check", ".draftspec/protected-files.snapshot.json"], appRoot);
}

function runProtected(args, cwd) {
  return spawnSync(process.execPath, [protectedScript, ...args], {
    cwd,
    encoding: "utf8"
  });
}
