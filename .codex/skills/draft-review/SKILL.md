---
name: draft-review
description: Review and test a frontend-only DraftKit workflow with human-feel criteria, click-through checks, and .draftspec completeness before approval. Use when a draft feature needs UX workflow validation without backend changes.
---

# Draft Review

Review the draft as a workflow, not just as code.

## Checks

- `node ./scripts/draftkit-session.mjs status` reports the current DraftKit mode, feature, approval state, and next actions.
- The draft is based on a recorded live baseline.
- The draft edits are isolated from the live working tree, or the missing isolation is reported as a blocking limitation.
- The draft is not stale against the current live baseline, or the stale state is called out before approval.
- The feature is reachable from the real app shell.
- Live and draft previews are distinguishable when both are running.
- The path has the fewest reasonable steps.
- No debug terminal or implementation-facing UI is exposed to end users.
- Success and failure paths are clickable or replayable.
- `.draftspec` names UI locations, states, actions, fixtures, and backend contract hints.
- Local draft data adapters do not call real services.

## Output

- Approval recommendation: `approve`, `revise`, or `block`.
- Workflow concerns ranked by severity.
- Missing `.draftspec` entries, if any.
- Baseline, isolation, and stale-state concerns, if any.
