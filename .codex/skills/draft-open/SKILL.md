---
name: draft-open
description: Open or resume an isolated DraftKit draft session for a feature from a live checkpoint, creating runtime state and a DraftKit-owned preview while keeping work frontend-only and draft-safe.
---

# Draft Open

Open or resume an isolated draft session for a feature.

## Command

```bash
node ./scripts/draftkit-session.mjs open <feature>
```

Use the direct Node command for Codex Desktop, WSL, and Linux sessions. Do not route this button through npm DraftKit aliases from a WSL UNC workspace.

## Rules

- Record the live baseline before draft edits begin.
- Create or resume isolated draft state for the feature through a worktree, sandbox, or overlay when available.
- Create or resume `.draftspec/state/` runtime state for the current session.
- Locate or create `.draftspec/features/<feature>.json`.
- Start or reuse a DraftKit-owned preview for the isolated draft state and report its URL.
- Do not reuse an externally owned live-app preview port as the draft preview.
- If `examples/<feature>/` does not exist, route preview traffic to the generic DraftKit host at `/draftkit/<feature>/` instead of pretending a feature route exists.
- Keep feature work inside the existing app shell.
- Use local draft data/state, fixtures, or browser-local persistence while draft mode is active.
- Do not edit real backend routes, database code, migrations, queues, or production API clients for an unapproved draft.
- Runtime state coordinates the session; it does not authorize go-live work.
- Consumer installs should not default to sample features such as `bulk-tagging`. If no feature is supplied and no isolated active draft can be resumed, fail with a clear feature-slug-required message.
- If the runtime cannot provide isolation yet, report that as a limitation and do not claim live/draft side-by-side safety.

## Output

- Mode, feature, live baseline, draft workspace/isolation status, draft preview URL, draft spec path, approval state, stale state, guardrail level, and next valid actions.
