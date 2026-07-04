---
name: draft-feature
description: Build frontend-only draft workflows inside the existing app shell using isolated draft state and a persisted .draftspec behavior graph. Use when a user wants to prototype, click through, or iterate on product behavior before backend implementation.
---

# Draft Feature

Build the feature as a draft-only workflow.

## Rules

- If a DraftKit session is already active, use `node ./scripts/draftkit-session.mjs status` as evidence before editing.
- Edit only inside the isolated draft workspace/state for that session.
- If the active draft is stale because live moved, ask for an explicit refresh/rebase, continue-stale, or cancel decision before editing.
- If no session is active and the user is starting a draft, open one with `node ./scripts/draftkit-session.mjs open <feature>`.
- Preserve the app shell, navigation, and shared components.
- Do not edit real backend routes, database code, migrations, or production API clients.
- Use local draft data adapters, fixtures, browser-local state, or local persistence.
- Record every meaningful user action in `.draftspec/features/<feature>.json`.
- Include UI locations, workflow states, success paths, failure paths, fixture data, and backend contract hints.
- Make the workflow clickable enough for a human to feel it in context.
- Preserve accepted constraints across iterations unless the user approves changing them.
- Keep implementation/storage details out of the product-facing UI unless explicitly requested.

## Output

- Draft UI code.
- Local draft data adapter or fixture code.
- Updated `.draftspec` graph.
- A short manual test path for the human reviewer.
