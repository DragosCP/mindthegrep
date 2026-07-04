---
name: draft-review
description: Review and test a frontend-only DraftKit workflow with human-feel criteria, click-through checks, and .draftspec completeness before approval. Use when a draft feature needs UX workflow validation without backend changes.
---

# Draft Review

Review the draft as a workflow, not just as code.

## Checks

- `node ./scripts/draftkit-session.mjs status` reports the current DraftKit mode, feature, approval state, and next actions.
- The feature is reachable from the real app shell.
- The path has the fewest reasonable steps.
- No debug terminal or implementation-facing UI is exposed to end users.
- Success and failure paths are clickable or replayable.
- `.draftspec` names UI locations, states, actions, fixtures, and backend contract hints.
- The fake backend does not call real services.

## Output

- Approval recommendation: `approve`, `revise`, or `block`.
- Workflow concerns ranked by severity.
- Missing `.draftspec` entries, if any.
