# Mind the Grep

Mind the Grep is an MVP for a draft-first agent workflow:

1. Build a new feature inside the real app shell.
2. Keep the feature frontend-only with fake data and local state.
3. Persist the workflow as a structured `.draftspec` graph.
4. Let a human click through and approve the behavior.
5. Map the approved graph to backend integration tasks.

The first vertical slice is a bulk-tagging workflow with optimistic update and rollback behavior.

The reusable handoff from validated draft to real backend work is defined in [Draft To Live Handoff](docs/DRAFT_TO_LIVE.md).
Longer-term validation memory lives in [Project Memory Index](docs/PROJECT_MEMORY_INDEX.md), [Manual Test Prompts](docs/MANUAL_TEST_PROMPTS.md), [Ralph And DraftKit Findings](docs/RALPH_DRAFTKIT_FINDINGS.md), and [Long Horizon Validation Plan](docs/LONG_HORIZON_VALIDATION_PLAN.md).

## Run

```bash
npm test
npm run draftkit:validate
npm run validate:spec
npm run approve:bulk-tagging
npm run map:bulk-tagging
npm run dev
```

Then open `http://localhost:5173/examples/bulk-tagging/`.

## Project Shape

- `src/draftkit/` contains the dependency-free runtime.
- `examples/bulk-tagging/` is the clickable draft demo.
- `.draftspec/features/` stores draft and approved behavior graphs.
- `scripts/` contains validation, approval, backend mapping, and dev-server helpers.
- `.codex/skills/` contains project-local workflow skills for agents.
- `docs/MANUAL_TEST_PROMPTS.md` stores intentionally vague prompts for manual validation.
- `docs/LONG_HORIZON_VALIDATION_PLAN.md` tracks the planned Codex, Claude Code, Ralph, and non-CLI validation rounds.

## Use In Another App

Install the DraftKit bridge into a downstream app:

```bash
npm run draftkit:init -- /path/to/app
```

That copies the draft skills, app-local `.draftspec` validator, protected-file checker, and an `AGENTS.md` DraftKit block into the target app. The installed app then has:

```bash
npm run draftkit:protect:snapshot
npm run draftkit:validate
npm run draftkit:protect:check
```

If the target app has no `package.json`, DraftKit creates a minimal private package manifest for these DraftKit commands. It does not convert the app to Node; it only adds the local command surface agents can invoke during draft review.

Run `draftkit:protect:snapshot` immediately after init or before draft edits. During review, run `draftkit:protect:check` against that baseline so backend/database mutations cannot be hidden by a late snapshot. Re-running snapshot is idempotent when protected file hashes are unchanged, so it does not churn the snapshot timestamp.

During draft mode, UI-only specs are valid with `backendContracts: []`. Deferred backend hints can be recorded with a backend contract marked `current: "deferred"` or `mode: "deferred"`.

## MVP Boundary

This repository intentionally does not implement a real backend. Backend work starts only after a `.draftspec` graph is approved.
