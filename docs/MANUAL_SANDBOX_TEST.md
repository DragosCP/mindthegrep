# Manual Sandbox Test: Todo Draft Board

Date: 2026-07-02

## Sandbox

- Path: `/home/drago/mindthegrep-sandboxes/todo-draftkit-manual`
- Visible tmux session: `mtg-draftkit-manual`
- Manual URL: `http://127.0.0.1:3001`

## Goal

Validate whether Codex can use DraftKit-style guardrails in a fresh downstream app:

1. Build a baseline Todo app with a tiny file-backed database.
2. Add a DraftKit bridge to the sandbox.
3. Ask nested Codex to turn one task list into `Tasks`, `In progress`, and `Done`.
4. Prove the change is frontend/draft-only and does not mutate backend/database code.

## Sandbox Commits

- `a3491c7` - Baseline Todo app with `data/tasks.json`, `src/db.js`, `src/server.js`, and tests.
- `3ea5c3a` - DraftKit sandbox bridge with local skill, `AGENTS.md`, and validation scripts.
- `84e3424` - Draft task board columns plus `.draftspec/features/task-board.json`.

## Verification Evidence

Final commands run in the sandbox:

```bash
npm test
npm run draftkit:validate
npm run draftkit:db-check
curl -fsS http://127.0.0.1:3001/tasks
curl -fsS http://127.0.0.1:3001/ | rg -n "Task board|Tasks|In progress|Done|todo-draft-task-board-statuses"
git diff HEAD~1..HEAD --name-status
```

Observed results:

- `npm test` passed: 6 tests, 0 failures.
- `npm run draftkit:validate` passed for `.draftspec/features/task-board.json`.
- `npm run draftkit:db-check` passed: `data/tasks.json: OK`.
- `GET /tasks` still returns the original three persisted tasks.
- The served HTML contains `Task board`, `Tasks`, `In progress`, `Done`, and the localStorage key.
- The final DraftKit change touched only:
  - `.draftspec/features/task-board.json`
  - `public/index.html`

## Product Findings

- The existing MVP is useful but too bulk-tagging-specific for a clean arbitrary-app test.
- A fresh app needs a small DraftKit bridge: local skill instructions, no-backend guardrails, a spec validator, and a database checksum guard.
- The nested Codex agent did load the `draft-feature` skill and followed the intended UI-first path once the bridge existed.
- The final implementation used localStorage for fake task status, leaving `GET /tasks` and `POST /tasks` unchanged.
- The `.draftspec` stayed in `draft` status and recorded UI, states, actions, fixtures, and deferred backend hints.

## Issue Captured

During the run, `data/tasks.json` temporarily contained an extra task titled `123`. The checksum guard caught it and forced recovery before completion.

This is valuable evidence: draft workflows need explicit protected-file checks, not just prompt instructions.

## Follow-Up Work

- Harden the reusable `draftkit:init` adapter installer for downstream apps.
- Expand UI-only/deferred-backend draft schema documentation.
- Add a browser click-through trace layer for moving tasks between columns.
- Expand protected-file checks that fail on database/schema/backend mutations during draft mode.
