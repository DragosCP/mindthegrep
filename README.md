# Mind the Grep / DraftKit

Mind the Grep is the DraftKit prototype: a simplified, repo-local version of
the Draft mode idea from [Codex Canvas](https://github.com/DragosCP/codex-canvas).

Codex Canvas explores a desktop workbench where builders can see a live app,
ask an agent for the next feature, preview that feature as a temporary Draft,
refine it visually, then approve or discard it before real backend, database,
API, or infrastructure work happens.

DraftKit keeps the same core product idea but strips it down to a portable
runtime and project-local Codex skills. It is for trying product behavior
before committing backend work.

DraftKit gives Codex project-local buttons/skills plus a small runtime:

- open an isolated frontend-only draft from the current live app;
- serve the draft on a DraftKit-owned preview port;
- record behavior as a structured `.draftspec` graph;
- let a human click through, revise, cancel, or approve the behavior;
- map only approved snapshots into live implementation work.

The bulk-tagging flow is the built-in sample. The reusable downstream-app
bridge is the main product direction.

The live handoff protocol is defined in [Draft To Live Handoff](docs/DRAFT_TO_LIVE.md).

## Relationship To Codex Canvas

Codex Canvas is the broader builder-facing shell: desktop app, live preview,
draft preview, visual context, and future shared vocabulary for screens,
panels, buttons, and flows.

DraftKit is the smaller runtime experiment underneath that direction:

- **Live baseline**: start from the current app instead of a detached mockup.
- **Draft workspace**: make the next feature visible while it is still cheap to
  change.
- **Frontend-only behavior**: use local draft state, fixtures, or browser-local
  persistence instead of production backend work.
- **Approve or discard**: keep failed drafts easy to throw away.
- **Draft-to-live handoff**: turn only approved behavior into implementation
  planning and backend integration.

The goal is not to fake production. The goal is to let the builder feel the
workflow before the app pays the cost of real implementation.

## Verify This Repo

```bash
npm test
npm run draftkit:validate
npm run approve:bulk-tagging
npm run map:bulk-tagging
```

Run the explicit sample preview:

```bash
npm run dev:bulk-tagging
```

Then open `http://localhost:5173/examples/bulk-tagging/`.

## Draft Button Commands

The project-local skills call direct Node commands so they work in Codex
Desktop, WSL, and npm script wrappers:

```bash
node ./scripts/draftkit-session.mjs status
node ./scripts/draftkit-session.mjs open <feature>
node ./scripts/draftkit-session.mjs cancel
node ./scripts/draftkit-session.mjs plan-to-go-live <feature>
node ./scripts/draftkit-session.mjs implement-to-live <feature>
```

Important behavior:

- `open <feature>` requires a feature unless an isolated active draft can be
  resumed.
- Consumer projects never default to the sample `bulk-tagging` feature.
- Draft preview health requires DraftKit identity verification, not just HTTP
  200 from a local server.
- `cancel` discards only isolated DraftKit-owned draft state and preserves
  unrelated live work.
- Go-live work requires an approved snapshot with `status: "approved"` and
  `snapshotId`.

## Project Shape

- `scripts/draftkit-session.mjs` owns local draft session state.
- `scripts/draftkit-preview-server.mjs` serves isolated draft previews.
- `scripts/draftkit-init.mjs` installs the bridge into downstream apps.
- `src/draftkit/` contains graph validation, flow helpers, and backend mapping.
- `examples/bulk-tagging/` is the explicit clickable sample.
- `.draftspec/features/` stores draft and approved behavior graphs.
- `.codex/skills/draft-*` contains project-local workflow skills for agents.

## Use In Another App

Current local development flow:

```bash
npm run draftkit:init -- /path/to/app
```

That copies the draft skills, app-local validator, protected-file checker,
runtime scripts, and an `AGENTS.md` DraftKit block into the target app. The
installed app then has:

```bash
npm run draftkit:status
npm run draftkit:open -- <feature>
npm run draftkit:cancel
npm run draftkit:protect:snapshot
npm run draftkit:validate
npm run draftkit:protect:check
```

Run `draftkit:protect:snapshot` immediately after init or before draft edits.
During review, run `draftkit:protect:check` against that baseline so
backend/database mutations cannot be hidden by a late snapshot.

Target packaged flow:

```bash
npm install -D draftkit
npx draftkit init
```

That package does not exist yet; the repo-local init command is the current
acceptance scaffold.

During draft mode, UI-only specs are valid with `backendContracts: []`.
Deferred backend hints can be recorded with a backend contract marked
`current: "deferred"` or `mode: "deferred"`.

## MVP Boundary

This repository intentionally does not implement a real production backend.
Backend work starts only after a `.draftspec` graph is approved.
