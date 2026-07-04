---
name: draft-status
description: Report the current DraftKit mode, feature, live baseline, draft workspace, preview URLs, spec path, approval state, stale-state warnings, and next valid actions without mutating runtime state.
---

# Draft Status

Use this button to inspect DraftKit session state from inside the current agent session.

## Command

```bash
node ./scripts/draftkit-session.mjs status
```

Use the direct Node command for Codex Desktop, WSL, and Linux sessions. Do not route this button through npm DraftKit aliases from a WSL UNC workspace.

## Rules

- Treat status as read-only.
- Report live, draft, or unknown/stale mode.
- Show feature, live baseline, draft workspace/isolation status, draft preview URL, live preview URL when known, draft spec, approved spec, approval state, snapshot ID, checks, stale reasons, and next valid actions.
- Report whether live has moved since the draft baseline.
- Do not use runtime state as authorization for backend work.
- If state is stale, report it clearly and route toward an explicit refresh/rebase, continue-stale, or `draft-cancel` recovery action.
- If the runtime cannot report baseline/isolation yet, call out that limitation.

## Output

- Current DraftKit mode and state.
- Any stale-state evidence.
- Baseline and isolation evidence when available.
- Next valid DraftKit actions.
