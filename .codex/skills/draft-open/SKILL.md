---
name: draft-open
description: Open or resume a DraftKit session for a feature, creating session-aware runtime state and a preview while keeping work draft-only.
---

# Draft Open

Open or resume draft mode for a feature.

## Command

```bash
node ./scripts/draftkit-session.mjs open <feature>
```

Use the direct Node command for Codex Desktop, WSL, and Linux sessions. Do not route this button through npm DraftKit aliases from a WSL UNC workspace.

## Rules

- Create or resume `.draftspec/state/` runtime state for the current session.
- Locate or create `.draftspec/features/<feature>.json`.
- Start or reuse a preview and report its URL when available.
- If `examples/<feature>/` does not exist, route preview traffic to the generic DraftKit host at `/draftkit/<feature>/` instead of pretending a feature route exists.
- Keep feature work inside the existing app shell.
- Use fake/local state or fixture services while draft mode is active.
- Do not edit real backend routes, database code, migrations, queues, or production API clients for an unapproved draft.
- Runtime state coordinates the session; it does not authorize go-live work.

## Output

- Mode, feature, preview URL, draft spec path, approval state, guardrail level, and next valid actions.
