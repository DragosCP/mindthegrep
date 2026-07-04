# DraftKit Button Workflow

Created: 2026-07-03
Updated: 2026-07-04

## Purpose

DraftKit exposes a session-native workflow surface for agents. Codex users can invoke project-local `$draft-*` skills, and CI or tests can call the matching npm scripts. Both surfaces use the same shared runtime in `scripts/draftkit-session.mjs`.

Use `node ./scripts/draftkit-session.mjs ...` as the reliable button command from Codex Desktop, WSL, and Linux sessions. Npm aliases remain available for WSL/Linux shells and CI, but Windows shells launched from a WSL UNC workspace can fall back to `C:\Windows` for relative npm script paths.

The buttons coordinate draft sessions. They do not weaken the core safety rule: live integration requires an approved `.draftspec` snapshot with `status: "approved"` and `snapshotId`.

## Draft Baseline And Isolation

The final product contract should treat each draft as an isolated session based on a specific live checkpoint.

```text
live baseline: commit/tree abc123
draft session: isolated changes on top of abc123
```

A draft should not be mixed into the same mutable working tree as live work. Otherwise `live`, `draft`, `cancel`, and `approve` become ambiguous.

Required model:

- `draft-open <feature>` records the live baseline before draft edits begin.
- Draft edits happen in an isolated worktree, sandbox, or overlay, not directly on top of the live working tree.
- The live app can keep running from the live baseline.
- The draft app runs from the isolated draft state on a DraftKit-owned preview port.
- `draft-cancel` discards the isolated draft and restores the user to the live baseline.
- `draft-approve` freezes the accepted draft behavior.
- `draft-implement-to-live` applies only approved behavior to the current live app.

If live changes while a draft exists, DraftKit should not silently replay the draft. It should mark the draft stale and require an explicit user action such as refresh/rebase, continue from the old baseline, or cancel.

## Target Install Model

The current GitHub-branch copy workflow is a manual acceptance scaffold, not the final product install story.

Target developer flow:

```bash
npm install -D draftkit
npx draftkit init
```

`draftkit init` should install project-local Codex skill wrappers under `.codex/skills/draft-*`, add minimal package scripts, update `.gitignore`, create `.draftspec/` directories, and keep reusable runtime code inside the npm package where possible.

Codex `$draft-*` buttons still require project-local skill files, so the npm package does not remove the init step. It makes the init step reliable, repeatable, versioned, and easy to upgrade.

## Button Set

| Button | Reliable Command | Npm Alias | Mutates Runtime State | Requires Approved Snapshot |
| --- | --- | --- | --- | --- |
| `draft-status` | `node ./scripts/draftkit-session.mjs status` | `npm run draftkit:status` | No | No |
| `draft-open` | `node ./scripts/draftkit-session.mjs open <feature>` | `npm run draftkit:open -- <feature>` | Yes | No |
| `draft-cancel` | `node ./scripts/draftkit-session.mjs cancel` | `npm run draftkit:cancel` | Yes | No |
| `draft-plan-to-go-live` | `node ./scripts/draftkit-session.mjs plan-to-go-live <feature>` | `npm run draftkit:plan-to-go-live -- <feature>` | Logs only | Yes |
| `draft-implement-to-live` | `node ./scripts/draftkit-session.mjs implement-to-live <feature>` | `npm run draftkit:implement-to-live -- <feature>` | Logs only | Yes |

## Runtime State

DraftKit runtime state is local operational data:

```text
.draftspec/state/draftkit-active.json
.draftspec/state/sessions/<session-id>/draftkit-state.json
.draftspec/logs/session-history.jsonl
```

These files may contain absolute paths, process IDs, preview ports, prompts, and local session history. They are ignored by git through `.gitignore`.

Runtime state can report that a draft session is active. It cannot authorize backend implementation. Approved `.draftspec` snapshots are the go-live authority.

## Product Artifacts

Reviewable product artifacts are separate from runtime state:

```text
.draftspec/features/<feature>.json
.draftspec/features/<feature>.approved.json
.draftspec/go-live/<feature>.plan.md
.draftspec/go-live/<feature>.plan.json
fixtures/backend-sandbox/features/<feature>.implementation.json
```

The fixture backend sandbox is used in this repository because there is no production backend/API/database target. It records approved contracts in a realistic implementation artifact without pretending the app has a live backend.

## `draft-status`

`draft-status` is read-only. It reports:

- mode: `live`, `draft`, or `unknown`
- state: `none`, `active`, `inactive`, or `stale`
- feature
- preview URL and health when known
- draft spec path and validation state
- approved spec path, approval state, and snapshot ID
- stale reasons
- next valid actions

Status treats missing session files, cwd drift, unhealthy previews, and dead recorded preview processes as stale state. It does not delete or repair state by itself.

## `draft-open`

`draft-open <feature>` creates or resumes draft mode.

It:

- records the live baseline for the draft session
- locates or creates `.draftspec/features/<feature>.json`
- starts or reuses a DraftKit-owned preview for the isolated draft state
- opens `examples/<feature>/` when that example exists
- otherwise opens the generic DraftKit host at `/draftkit/<feature>/`, rendering the current draft spec as a scaffold preview
- writes both the session state and active mirror
- appends local session history
- reports the preview, spec path, approval state, advisory guardrail level, and next actions

While draft mode is active, agents should keep work inside the existing app shell, use local draft data/state, and avoid real backend, database, schema, queue, or production API edits unless an approved go-live workflow is running.

Consumer installs should not default to sample features such as `bulk-tagging`. If no feature is provided and no isolated draft session can be resumed, `draft-open` should fail with a clear feature-slug-required message.

## `draft-cancel`

`draft-cancel` currently exits draft mode without deleting draft work. That is the current MVP behavior, not the final product contract.

It:

- marks the session cancelled
- removes `.draftspec/state/draftkit-active.json`
- appends a session-history event
- preserves draft and approved specs
- stops only a preview process DraftKit started and can still verify by identity

Cancel refuses to kill unknown processes or processes that only match by PID.

Required product behavior: cancelling a draft should restore the pre-draft live baseline. DraftKit needs a baseline/isolation mechanism so `draft-cancel` can discard draft-session edits without reverting unrelated user work. If it cannot safely separate draft edits from pre-existing changes, it should block with a clear recovery path instead of reporting that the draft was cancelled while leaving the app changed.

In the target model, `draft-cancel` deletes or discards the isolated draft workspace/overlay and leaves the live working tree unchanged.

## `draft-plan-to-go-live`

`draft-plan-to-go-live <feature>` creates implementation plan artifacts from an approved snapshot.

It refuses to proceed unless `.draftspec/features/<feature>.approved.json` validates with `status: "approved"` and `snapshotId`.

It writes:

```text
.draftspec/go-live/<feature>.plan.md
.draftspec/go-live/<feature>.plan.json
```

The plan includes the approved snapshot ID, behavior summary, backend contracts, repository boundary discovery, database and API implications, tests, risks, and implementation order. It does not implement.

## `draft-implement-to-live`

`draft-implement-to-live <feature>` implements only approved contracts.

It:

- requires a valid approved spec
- uses an existing go-live plan when present
- creates a plan first when none exists
- rejects stale plans whose `snapshotId` differs from the approved spec
- writes fixture backend implementation artifacts for this no-backend repo

The implementation artifact records that authorization came from the approved snapshot, not runtime state.

## Failure Modes

- Unapproved drafts are refused by both go-live buttons.
- Invalid approved specs are refused.
- Stale plans are rejected before implementation.
- `draft-status` reports stale state instead of trusting broken runtime files.
- `draft-cancel` does not kill foreign or unverifiable processes.
- Runtime state and logs are ignored by git, while product specs, approved snapshots, go-live plans, and fixture implementation artifacts remain reviewable.
