import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const initScript = path.join(repoRoot, "scripts/draftkit-init.mjs");

test("draftkit:init installs a draft bridge into a downstream app", async () => {
  const appRoot = await createDownstreamApp();

  const result = runNode(initScript, [appRoot], repoRoot);
  assert.equal(result.status, 0, result.stderr);

  assert.match(await readFile(path.join(appRoot, "AGENTS.md"), "utf8"), /DRAFTKIT:START/);
  assert.match(await readFile(path.join(appRoot, "AGENTS.md"), "utf8"), /draftkit:protect:snapshot.*before draft edits/s);
  await assertFile(path.join(appRoot, ".codex/skills/draft-feature/SKILL.md"));
  await assertFile(path.join(appRoot, ".codex/skills/draft-integrate/SKILL.md"));
  await assertFile(path.join(appRoot, "scripts/validate-draftspec.mjs"));
  await assertFile(path.join(appRoot, "scripts/check-protected-files.mjs"));

  const packageJson = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts.test, "node --test");
  assert.equal(packageJson.scripts["draftkit:validate"], "node scripts/validate-draftspec.mjs");
  assert.equal(
    packageJson.scripts["draftkit:protect:snapshot"],
    "node scripts/check-protected-files.mjs snapshot .draftspec/protected-files.json .draftspec/protected-files.snapshot.json"
  );
  assert.equal(
    packageJson.scripts["draftkit:protect:check"],
    "node scripts/check-protected-files.mjs check .draftspec/protected-files.snapshot.json"
  );

  const protectedConfig = JSON.parse(await readFile(path.join(appRoot, ".draftspec/protected-files.json"), "utf8"));
  assert.deepEqual(protectedConfig.files, ["data/tasks.json", "src/db.js", "src/server.js"]);
});

test("draftkit:init is idempotent and preserves existing app content", async () => {
  const appRoot = await createDownstreamApp();

  assert.equal(runNode(initScript, [appRoot], repoRoot).status, 0);
  assert.equal(runNode(initScript, [appRoot], repoRoot).status, 0);

  const agents = await readFile(path.join(appRoot, "AGENTS.md"), "utf8");
  assert.match(agents, /Manual downstream instructions/);
  assert.equal((agents.match(/DRAFTKIT:START/g) || []).length, 1);

  const packageJson = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts.test, "node --test");
  assert.equal(packageJson.scripts["draftkit:validate"], "node scripts/validate-draftspec.mjs");
});

test("draftkit:init refuses invalid target directories", async () => {
  const missing = path.join(tmpdir(), `missing-draftkit-${Date.now()}`);
  const missingResult = runNode(initScript, [missing], repoRoot);
  assert.notEqual(missingResult.status, 0);
  assert.match(missingResult.stderr, /Target directory does not exist/);

  const noPackageRoot = await mkdtemp(path.join(tmpdir(), "draftkit-no-package-"));
  const noPackageResult = runNode(initScript, [noPackageRoot], repoRoot);
  assert.notEqual(noPackageResult.status, 0);
  assert.match(noPackageResult.stderr, /package\.json/);
});

test("installed downstream bridge validates UI-only specs and protects live files", async () => {
  const appRoot = await createDownstreamApp();
  assert.equal(runNode(initScript, [appRoot], repoRoot).status, 0);

  await writeFile(
    path.join(appRoot, ".draftspec/features/task-board.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        feature: "task-board",
        status: "draft",
        ui: [{ id: "task-list", location: "/tasks", type: "section" }],
        states: [
          { id: "idle", label: "Idle" },
          { id: "moved", label: "Moved locally" }
        ],
        actions: [{ id: "move-task", from: "idle", event: "drag.task", to: "moved", ui: "task-list" }],
        fixtures: [{ id: "tasks", kind: "localStorage" }],
        backendContracts: []
      },
      null,
      2
    )}\n`
  );

  assert.equal(runNode(path.join(appRoot, "scripts/validate-draftspec.mjs"), [], appRoot).status, 0);
  await writeFile(
    path.join(appRoot, ".draftspec/features/invalid-backend-contract.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        feature: "invalid-backend-contract",
        status: "draft",
        ui: [{ id: "task-list", location: "/tasks", type: "section" }],
        states: [{ id: "idle", label: "Idle" }],
        actions: [{ id: "view", from: "idle", event: "view", to: "idle", ui: "task-list" }],
        fixtures: [],
        backendContracts: [{ id: "persistTaskStatus", routeHint: "PATCH /tasks/:id/status" }]
      },
      null,
      2
    )}\n`
  );
  const invalidSpec = runNode(path.join(appRoot, "scripts/validate-draftspec.mjs"), [], appRoot);
  assert.notEqual(invalidSpec.status, 0);
  assert.match(invalidSpec.stderr, /backend contract persistTaskStatus missing operation/);
  await rm(path.join(appRoot, ".draftspec/features/invalid-backend-contract.json"));

  assert.equal(
    runNode(
      path.join(appRoot, "scripts/check-protected-files.mjs"),
      ["snapshot", ".draftspec/protected-files.json", ".draftspec/protected-files.snapshot.json"],
      appRoot
    ).status,
    0
  );
  assert.equal(
    runNode(
      path.join(appRoot, "scripts/check-protected-files.mjs"),
      ["check", ".draftspec/protected-files.snapshot.json"],
      appRoot
    ).status,
    0
  );

  await writeFile(path.join(appRoot, "data/tasks.json"), `${JSON.stringify([{ id: 1, title: "mutated" }])}\n`);
  const failedCheck = runNode(
    path.join(appRoot, "scripts/check-protected-files.mjs"),
    ["check", ".draftspec/protected-files.snapshot.json"],
    appRoot
  );
  assert.notEqual(failedCheck.status, 0);
  assert.match(failedCheck.stderr, /data\/tasks\.json: changed/);
});

async function createDownstreamApp() {
  const appRoot = await mkdtemp(path.join(tmpdir(), "draftkit-app-"));
  await mkdir(path.join(appRoot, "data"), { recursive: true });
  await mkdir(path.join(appRoot, "src"), { recursive: true });
  await writeFile(
    path.join(appRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "downstream-todo",
        version: "1.0.0",
        scripts: {
          test: "node --test"
        }
      },
      null,
      2
    )}\n`
  );
  await writeFile(path.join(appRoot, "AGENTS.md"), "# Downstream App\n\nManual downstream instructions.\n");
  await writeFile(path.join(appRoot, "data/tasks.json"), `${JSON.stringify([{ id: 1, title: "Task" }])}\n`);
  await writeFile(path.join(appRoot, "src/db.js"), "export function readTasks() { return []; }\n");
  await writeFile(path.join(appRoot, "src/server.js"), "export function startServer() { return true; }\n");
  return appRoot;
}

async function assertFile(filePath) {
  const file = await readFile(filePath, "utf8");
  assert.equal(typeof file, "string");
}

function runNode(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8"
  });
}
