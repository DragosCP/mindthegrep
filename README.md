# Mind the Grep

Mind the Grep is an MVP for a draft-first agent workflow:

1. Build a new feature inside the real app shell.
2. Keep the feature frontend-only with fake data and local state.
3. Persist the workflow as a structured `.draftspec` graph.
4. Let a human click through and approve the behavior.
5. Map the approved graph to backend integration tasks.

The first vertical slice is a bulk-tagging workflow with optimistic update and rollback behavior.

## Run

```bash
npm test
npm run validate:spec
npm run approve:bulk-tagging
npm run map:bulk-tagging
npm run dev
```

Then open `http://localhost:5173/examples/bulk-tagging/`.

## DraftKit Buttons

The repo exposes session-visible DraftKit workflows as direct Node commands, npm aliases, and project-local Codex skills. Use the direct Node command from Codex Desktop or any WSL UNC workspace; the npm aliases are convenience commands for WSL/Linux shells and CI.

| Button | Reliable command | Npm alias | Purpose |
| --- | --- | --- | --- |
| `draft-status` | `node ./scripts/draftkit-session.mjs status` | `npm run draftkit:status` | Report live/draft/stale state, feature, preview, spec paths, approval state, and next actions. |
| `draft-open` | `node ./scripts/draftkit-session.mjs open <feature>` | `npm run draftkit:open -- <feature>` | Create or resume draft runtime state and open a preview for the feature. |
| `draft-cancel` | `node ./scripts/draftkit-session.mjs cancel` | `npm run draftkit:cancel` | Exit draft mode, clear the active state mirror, preserve specs, and stop only verified DraftKit-owned previews. |
| `draft-plan-to-go-live` | `node ./scripts/draftkit-session.mjs plan-to-go-live <feature>` | `npm run draftkit:plan-to-go-live -- <feature>` | Write approved-snapshot go-live plan artifacts under `.draftspec/go-live/`. |
| `draft-implement-to-live` | `node ./scripts/draftkit-session.mjs implement-to-live <feature>` | `npm run draftkit:implement-to-live -- <feature>` | Implement approved contracts into the fixture backend sandbox when this repo has no production backend target. |

Runtime state lives under `.draftspec/state/` and `.draftspec/logs/`; those paths are local operational data and ignored by git. Product artifacts remain under `.draftspec/features/`, approved snapshots, `.draftspec/go-live/`, and `fixtures/backend-sandbox/`.

`draft-open <feature>` uses `examples/<feature>/` when that route exists. Otherwise it opens the generic DraftKit host at `/draftkit/<feature>/`, which renders the current draft spec without pretending a feature-specific route has already been built.

## Project Shape

- `src/draftkit/` contains the dependency-free runtime.
- `examples/bulk-tagging/` is the clickable draft demo.
- `.draftspec/features/` stores draft and approved behavior graphs.
- `.draftspec/go-live/` stores approved-snapshot go-live plans.
- `fixtures/backend-sandbox/` stores fixture-backed implementation artifacts when no production backend exists.
- `scripts/` contains validation, approval, backend mapping, and dev-server helpers.
- `.codex/skills/` contains project-local workflow skills for agents.
- `docs/DRAFTKIT_BUTTONS.md` describes the implemented session-visible draft/live button surface.

## MVP Boundary

This repository intentionally does not implement a real backend. Backend work starts only after a `.draftspec` graph is approved.
