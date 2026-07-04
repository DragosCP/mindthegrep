---
name: draft-status
description: Report the current DraftKit mode, feature, preview, spec path, approval state, stale-state warnings, and next valid actions without mutating runtime state.
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
- Show feature, preview URL, draft spec, approved spec, approval state, snapshot ID, checks, stale reasons, and next valid actions.
- Do not use runtime state as authorization for backend work.
- If state is stale, report it clearly and route toward `draft-open`, `draft-cancel`, or another explicit recovery action.

## Output

- Current DraftKit mode and state.
- Any stale-state evidence.
- Next valid DraftKit actions.
