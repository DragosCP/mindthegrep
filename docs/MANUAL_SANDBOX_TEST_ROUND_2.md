# Manual Sandbox Test Round 2

Date: 2026-07-02

Harness:

- Codex CLI `0.142.5` launched from nested `codex exec` sessions.
- OMX/Ralph-style supervision from the parent Codex session.
- Sandbox path: `/home/drago/mindthegrep-sandboxes/todo-draftkit-round2`
- Context snapshot: `.omx/context/codex-cli-manual-round-2-20260702T183155Z.md`

## Goal

Stress the DraftKit Live -> Draft -> Live handoff -> Draft loop with vague prompts in a real downstream app.

The test intentionally used a tiny Python/SQLite Todo app so DraftKit had to work outside a Node-native app.

## Prompt And Commit Log

| Step | Prompt | Sandbox commit |
| --- | --- | --- |
| 1 | `Build a tiny todo app here. It should have a list of tasks and a small local database. Keep it simple.` | `03b7c8d` Baseline tiny todo app |
| bridge | Install DraftKit bridge from this repo. | `3e62af4` Install DraftKit bridge |
| 2 | `Now in draft mode, I want to see this as three columns instead of one list: tasks, in progress, and done. I want to click around and feel it first.` | `84d8311` Draft three column task board |
| 3 | `Make this feel more like a proper app. Keep the same product, but make the screen feel easier to use.` | `e201d0b` Polish draft task board workflow |
| 4 | `I want to be able to move tasks around between the columns and feel how that works.` | `74f0eed` Add draft drag and drop task movement |
| 5 | `I think we need settings for this board. Where should that live in the UI?` | `81915ce` Add draft board settings placement |
| 6 | `Put that settings entry somewhere else. I want to try a different location before deciding.` | `0c6032f` Move draft board settings entry |
| 7 | `When I open settings, I want to manage the board columns. Let me add one more column, but no more than four total.` | `d6b8c0d` Add draft board column management |
| 8 | `I want to try categories for tasks. Maybe there is a setting for that, and when it is on I can add a category while creating a task.` | `9034686` Add draft task categories toggle |
| 9 | `Actually, I do not want a setting for categories. Make categories always available, then prepare this to become real.` | `b2b7ebd` Approve always available draft categories |
| 10 | `Now I want to try a new page for habits and goals. It should feel like the same app, but the data can be fake.` | `5f303b9` Draft habits and goals page |

## Verification

Repeated checks after meaningful draft checkpoints:

```bash
npm run draftkit:validate
npm run draftkit:protect:check
node --check public/app.js
git diff --check
```

Served smoke checks used `python3 -m http.server 4173 --bind 127.0.0.1 --directory public` and `curl` against `/`, `/app.js`, and `/styles.css`.

Browser automation was not available in the sandbox: `playwright` was not installed. This means the run proves static/served/syntax/spec/protection behavior, but not full visual click-through behavior.

## Results

What worked:

- DraftKit skills were picked up by nested Codex sessions. Prompt 10 explicitly chose `draft-feature`; Prompt 9 chose `draft-feature` plus `draft-approve`.
- Backend/database files stayed unchanged across draft work. `app.py` and `todo.db` were protected and `npm run draftkit:protect:check` passed after each draft checkpoint.
- The agent kept changes inside the existing app shell. It did not create a standalone marketing page or debug terminal UI.
- Draft iteration persisted across separate Codex sessions: settings placement, column management, categories, and the habits page all built on prior draft state.
- After the approved task-board snapshot, Prompt 10 created a separate `.draftspec/features/habits-and-goals-page.json` draft instead of mutating only the approved board spec.

What failed or needs product hardening:

- The original DraftKit init bridge assumed a Node app. The Python/SQLite sandbox forced a fix: create a minimal private `package.json` when missing and detect Python/SQLite protected files.
- `draftkit:protect:snapshot` rewrote `createdAt` every time even when protected hashes were identical. This caused repeated dirty timestamp diffs during the manual loop.
- Prompt 9 was too easy to interpret as human approval. The agent produced an approved `snapshotId` from vague wording without an explicit clicked-through acceptance gate.
- Nested Codex often ignored "do not print full diffs" and started foreground servers. A Ralph/OMX automation needs bounded log capture and controlled server process handling.
- Without Playwright/browser tooling, the agent could only prove served assets and static behavior markers. The human feel-test still needs an open preview and manual clicking.

## Product Changes From This Run

Implemented in the main repo after this test:

- `draftkit:init` now supports non-Node downstream apps by creating a minimal private `package.json`.
- Protected-file detection includes Python app files, SQLite/database files, JSON data files, and common persistence paths.
- Protected snapshots now preserve `createdAt` when the protected file list, hashes, and sizes are unchanged.

Still recommended:

- Add explicit lifecycle commands or states: `open`, `park`, `discard`, `approve`, `integrate`.
- Make approval require a human acceptance phrase or command, not vague "prepare this to become real" language.
- Add an app-local visible DraftKit overlay for mode and actions.
- Add an automated browser click-through harness for DraftKit manual tests.
- Add bounded Codex/Ralph run capture so inner agents cannot flood logs or leave foreground servers running.
