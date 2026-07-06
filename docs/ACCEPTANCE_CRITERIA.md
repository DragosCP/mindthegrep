# Acceptance Criteria

- `npm test` passes.
- `npm run draftkit:validate` validates app-agnostic `.draftspec/features/*.json` files.
- `npm run draftkit:open -- <feature>` opens an isolated draft session and
  requires an explicit feature unless an isolated active draft can be resumed.
- Draft preview uses a DraftKit-owned port, not an externally owned live app
  port.
- Draft preview health requires matching preview identity; a generic HTTP 200
  is not enough.
- `npm run draftkit:status` reports baseline, workspace, preview health, stale
  reasons, and next actions without mutating state.
- `npm run draftkit:cancel` discards isolated draft state and preserves
  unrelated live work.
- `npm run approve:bulk-tagging` writes an approved snapshot.
- `npm run map:bulk-tagging` emits backend tasks from the approved snapshot.
- `npm run dev:bulk-tagging` serves the explicit clickable bulk-tagging demo.
- `npm run draftkit:init -- <target-app>` installs local draft skills, validator scripts, protected-file checks, and package scripts into a downstream app.
- Protected-file checks fail if draft work mutates live database/backend files.
- UI-only drafts with `backendContracts: []` are valid, and approved UI-only specs map to no backend tasks.
- Draft feature code uses local draft data/state and stays outside backend implementation paths.
- Project-local skills explain the draft, review, approve, and integrate phases.
