# Acceptance Criteria

- `npm test` passes.
- `npm run validate:spec` validates `.draftspec/features/bulk-tagging.json`.
- `npm run approve:bulk-tagging` writes an approved snapshot.
- `npm run map:bulk-tagging` emits backend tasks from the approved snapshot.
- `npm run dev` serves a clickable bulk-tagging demo.
- Draft feature code lives outside backend implementation paths.
- Project-local skills explain the draft, review, approve, and integrate phases.
- `node ./scripts/draftkit-session.mjs status` reports live/draft/stale state without mutating state.
- `node ./scripts/draftkit-session.mjs open bulk-tagging` creates or resumes session-aware runtime state.
- `node ./scripts/draftkit-session.mjs cancel` clears the active runtime mirror and preserves specs.
- `node ./scripts/draftkit-session.mjs plan-to-go-live bulk-tagging` writes approved-snapshot plan artifacts.
- `node ./scripts/draftkit-session.mjs implement-to-live bulk-tagging` writes approved fixture backend artifacts or refuses invalid approvals/stale plans.
- `.draftspec/state/` and `.draftspec/logs/` remain ignored local operational data.
