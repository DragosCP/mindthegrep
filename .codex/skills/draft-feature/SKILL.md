---
name: draft-feature
description: Build frontend-only draft workflows inside the existing app shell with fake data and a persisted .draftspec behavior graph. Use when a user wants to prototype, click through, or iterate on a feature workflow before backend implementation.
---

# Draft Feature

Build the feature as a draft-only workflow.

## Rules

- If a DraftKit session is already active, use `node ./scripts/draftkit-session.mjs status` as the session evidence before editing.
- If no session is active and the user is starting a draft, open one with `node ./scripts/draftkit-session.mjs open <feature>`.
- Preserve the app shell, navigation, and shared components.
- Do not edit real backend routes, database code, migrations, or production API clients.
- Use local fixtures, local state, or fake service adapters.
- Record every meaningful user action in `.draftspec/features/<feature>.json`.
- Include UI locations, workflow states, success paths, failure paths, fixture data, and backend contract hints.
- Make the workflow clickable enough for a human to feel it in context.

## Output

- Draft UI code.
- Fake backend or fixture code.
- Updated `.draftspec` graph.
- A short manual test path for the human reviewer.
