# Mind the Grep

Mind the Grep is an MVP for a draft-first agent workflow:

1. Build a new feature inside the real app shell.
2. Keep the feature frontend-only with fake data and local state.
3. Persist the workflow as a structured `.draftspec` graph.
4. Let a human click through and approve the behavior.
5. Map the approved graph to backend integration tasks.

The first vertical slice is a bulk-tagging workflow with optimistic update and rollback behavior.

The reusable handoff from validated draft to real backend work is defined in [Draft To Live Handoff](docs/DRAFT_TO_LIVE.md).

## Run

```bash
npm test
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

## MVP Boundary

This repository intentionally does not implement a real backend. Backend work starts only after a `.draftspec` graph is approved.
