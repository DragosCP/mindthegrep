#!/usr/bin/env node
import { access, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DRAFTKIT_BLOCK_START = "<!-- DRAFTKIT:START -->";
const DRAFTKIT_BLOCK_END = "<!-- DRAFTKIT:END -->";
const SKILL_NAMES = [
  "draft-status",
  "draft-open",
  "draft-cancel",
  "draft-feature",
  "draft-review",
  "draft-approve",
  "draft-plan-to-go-live",
  "draft-implement-to-live",
  "draft-integrate"
];
const PROTECTED_CONFIG_PATH = ".draftspec/protected-files.json";
const VALIDATOR_SCRIPT = "scripts/validate-draftspec.mjs";
const PROTECTED_SCRIPT = "scripts/check-protected-files.mjs";
const RUNTIME_SCRIPTS = ["scripts/draftkit-session.mjs", "scripts/draftkit-preview-server.mjs"];
const RUNTIME_SCHEMA = "schemas/draftkit-state.schema.json";
const RUNTIME_SOURCE_DIR = "src/draftkit";
const DRAFTKIT_GITIGNORE_LINES = [".draftspec/state/", ".draftspec/logs/"];

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

if (isCli()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await initDraftKit(options);
    printResult(result);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

export async function initDraftKit({ targetDir, force = false }) {
  if (!targetDir) usage();

  const targetRoot = path.resolve(targetDir);
  await assertDirectory(targetRoot, `Target directory does not exist: ${targetDir}`);
  await assertFile(path.join(targetRoot, "package.json"), "Target app must contain package.json");

  const result = {
    targetRoot,
    installed: [],
    kept: [],
    protectedFiles: []
  };

  await mkdir(path.join(targetRoot, ".codex/skills"), { recursive: true });
  await mkdir(path.join(targetRoot, ".draftspec/features"), { recursive: true });
  await mkdir(path.join(targetRoot, "scripts"), { recursive: true });
  await mkdir(path.join(targetRoot, "schemas"), { recursive: true });
  await mkdir(path.join(targetRoot, "src"), { recursive: true });

  for (const skillName of SKILL_NAMES) {
    const source = path.join(repoRoot, ".codex/skills", skillName);
    const destination = path.join(targetRoot, ".codex/skills", skillName);
    await copyGeneratedPath(source, destination, { force, result, label: `.codex/skills/${skillName}` });
  }

  await copyGeneratedPath(path.join(repoRoot, VALIDATOR_SCRIPT), path.join(targetRoot, VALIDATOR_SCRIPT), {
    force,
    result,
    label: VALIDATOR_SCRIPT
  });
  await copyGeneratedPath(path.join(repoRoot, PROTECTED_SCRIPT), path.join(targetRoot, PROTECTED_SCRIPT), {
    force,
    result,
    label: PROTECTED_SCRIPT
  });
  for (const runtimeScript of RUNTIME_SCRIPTS) {
    await copyGeneratedPath(path.join(repoRoot, runtimeScript), path.join(targetRoot, runtimeScript), {
      force,
      result,
      label: runtimeScript
    });
  }
  await copyGeneratedPath(path.join(repoRoot, RUNTIME_SCHEMA), path.join(targetRoot, RUNTIME_SCHEMA), {
    force,
    result,
    label: RUNTIME_SCHEMA
  });
  await copyGeneratedPath(path.join(repoRoot, RUNTIME_SOURCE_DIR), path.join(targetRoot, RUNTIME_SOURCE_DIR), {
    force,
    result,
    label: RUNTIME_SOURCE_DIR
  });

  await updateAgentsFile(targetRoot, result);
  await updatePackageScripts(targetRoot, { force, result });
  await updateGitignore(targetRoot, result);

  const protectedFiles = await detectProtectedFiles(targetRoot);
  result.protectedFiles = protectedFiles;
  await writeGeneratedJson(
    path.join(targetRoot, PROTECTED_CONFIG_PATH),
    {
      version: 1,
      files: protectedFiles,
      notes: "DraftKit protects these live backend, schema, route, and persistence files during draft mode."
    },
    { force, result, label: PROTECTED_CONFIG_PATH }
  );

  return result;
}

function parseArgs(args) {
  const options = { targetDir: null, force: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--force") {
      options.force = true;
    } else if (arg === "--target") {
      index += 1;
      options.targetDir = args[index];
    } else if (arg === "-h" || arg === "--help") {
      usage(0);
    } else if (!options.targetDir) {
      options.targetDir = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return options;
}

async function copyGeneratedPath(source, destination, { force, result, label }) {
  if ((await exists(destination)) && !force) {
    result.kept.push(label);
    return;
  }

  await cp(source, destination, { recursive: true, force: true });
  result.installed.push(label);
}

async function updateAgentsFile(targetRoot, result) {
  const agentsPath = path.join(targetRoot, "AGENTS.md");
  const existing = (await exists(agentsPath)) ? await readFile(agentsPath, "utf8") : "";

  if (existing.includes(DRAFTKIT_BLOCK_START)) {
    result.kept.push("AGENTS.md DraftKit block");
    return;
  }

  const next = `${existing.trimEnd()}${existing.trimEnd() ? "\n\n" : ""}${DRAFTKIT_BLOCK_START}
## DraftKit Mode

Use DraftKit when the builder asks to prototype or revise workflow behavior before backend work.

- Build draft features in the current live app shell.
- Use \`node ./scripts/draftkit-session.mjs open <feature>\` to create an isolated draft session before draft edits.
- Use \`node ./scripts/draftkit-session.mjs status\` for read-only baseline, workspace, preview, and stale-state evidence.
- Keep draft behavior frontend-only with local state, fixtures, fake adapters, or localStorage.
- Do not edit real backend routes, database files, migrations, schema files, or production API clients during draft mode.
- Record UI locations, states, actions, fixtures, and deferred backend hints in \`.draftspec/features/<feature>.json\`.
- Run \`npm run draftkit:protect:snapshot\` immediately after init or before draft edits to capture the live baseline.
- Run \`npm run draftkit:validate\` and \`npm run draftkit:protect:check\` before claiming a draft is ready for review.
- After the human approves the clicked-through workflow, switch to live integration from the approved snapshot instead of prose.
${DRAFTKIT_BLOCK_END}
`;

  await writeFile(agentsPath, next);
  result.installed.push("AGENTS.md DraftKit block");
}

async function updatePackageScripts(targetRoot, { force, result }) {
  const packagePath = path.join(targetRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  packageJson.scripts = packageJson.scripts || {};

  const scripts = {
    "draftkit:validate": "node scripts/validate-draftspec.mjs",
    "draftkit:status": "node scripts/draftkit-session.mjs status",
    "draftkit:open": "node scripts/draftkit-session.mjs open",
    "draftkit:cancel": "node scripts/draftkit-session.mjs cancel",
    "draftkit:plan-to-go-live": "node scripts/draftkit-session.mjs plan-to-go-live",
    "draftkit:implement-to-live": "node scripts/draftkit-session.mjs implement-to-live",
    "draftkit:protect:snapshot":
      "node scripts/check-protected-files.mjs snapshot .draftspec/protected-files.json .draftspec/protected-files.snapshot.json",
    "draftkit:protect:check": "node scripts/check-protected-files.mjs check .draftspec/protected-files.snapshot.json"
  };

  for (const [name, command] of Object.entries(scripts)) {
    if (packageJson.scripts[name] && !force) {
      result.kept.push(`package.json script ${name}`);
      continue;
    }
    packageJson.scripts[name] = command;
    result.installed.push(`package.json script ${name}`);
  }

  await writeFile(packagePath, `${stableStringify(packageJson)}\n`);
}

async function updateGitignore(targetRoot, result) {
  const gitignorePath = path.join(targetRoot, ".gitignore");
  const existing = (await exists(gitignorePath)) ? await readFile(gitignorePath, "utf8") : "";
  const missing = DRAFTKIT_GITIGNORE_LINES.filter((line) => !existing.split(/\r?\n/).includes(line));
  if (missing.length === 0) {
    result.kept.push(".gitignore DraftKit runtime ignores");
    return;
  }

  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  await writeFile(gitignorePath, `${existing}${prefix}${missing.join("\n")}\n`);
  result.installed.push(".gitignore DraftKit runtime ignores");
}

async function detectProtectedFiles(targetRoot) {
  const allFiles = await walk(targetRoot);
  const protectedFiles = allFiles
    .map((filePath) => toPosix(path.relative(targetRoot, filePath)))
    .filter((filePath) => matchesProtectedFile(filePath))
    .sort();

  return [...new Set(protectedFiles)];
}

async function walk(root) {
  const ignored = new Set([".git", "node_modules", ".omx", "dist", "build", "coverage"]);
  const entries = [];

  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        entries.push(fullPath);
      }
    }
  }

  await visit(root);
  return entries;
}

function matchesProtectedFile(filePath) {
  if (/^data\/[^/]+\.json$/.test(filePath)) return true;
  if (/^src\/db\.[cm]?[jt]s$/.test(filePath)) return true;
  if (/^src\/server\.[cm]?[jt]s$/.test(filePath)) return true;
  if (/^src\/(api|routes|models|repositories|services)\//.test(filePath)) return true;
  if (/^(migrations|prisma|drizzle)\//.test(filePath)) return true;
  if (/^(schema|db-schema|database-schema)(\.|\/)/.test(filePath)) return true;
  return false;
}

async function writeGeneratedJson(filePath, value, { force, result, label }) {
  if ((await exists(filePath)) && !force) {
    result.kept.push(label);
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${stableStringify(value)}\n`);
  result.installed.push(label);
}

async function assertDirectory(dirPath, message) {
  try {
    const dirStat = await stat(dirPath);
    if (!dirStat.isDirectory()) throw new Error(message);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(message);
    throw error;
  }
}

async function assertFile(filePath, message) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error(message);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(message);
    throw error;
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
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

function printResult(result) {
  console.log(`DraftKit initialized: ${result.targetRoot}`);
  if (result.installed.length > 0) {
    console.log(`installed:\n${result.installed.map((entry) => `- ${entry}`).join("\n")}`);
  }
  if (result.kept.length > 0) {
    console.log(`kept:\n${result.kept.map((entry) => `- ${entry}`).join("\n")}`);
  }
  if (result.protectedFiles.length > 0) {
    console.log(`protected files:\n${result.protectedFiles.map((entry) => `- ${entry}`).join("\n")}`);
  } else {
    console.log(`protected files: none detected; edit ${PROTECTED_CONFIG_PATH} before draft review`);
  }
}

function isCli() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function usage(exitCode = 2) {
  console.error(`Usage:
  node scripts/draftkit-init.mjs <target-app> [--force]
  node scripts/draftkit-init.mjs --target <target-app> [--force]`);
  process.exit(exitCode);
}
