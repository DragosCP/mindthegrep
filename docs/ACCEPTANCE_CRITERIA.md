# Acceptance Criteria

- `npm test` passes.
- `npm run draftkit:validate` validates app-agnostic `.draftspec/features/*.json` files.
- `npm run validate:spec` validates `.draftspec/features/bulk-tagging.json`.
- `npm run approve:bulk-tagging` writes an approved snapshot.
- `npm run map:bulk-tagging` emits backend tasks from the approved snapshot.
- `npm run dev` serves a clickable bulk-tagging demo.
- `npm run draftkit:init -- <target-app>` installs local draft skills, validator scripts, protected-file checks, and package scripts into a downstream app.
- Protected-file checks fail if draft work mutates live database/backend files.
- UI-only drafts with `backendContracts: []` are valid, and approved UI-only specs map to no backend tasks.
- Draft feature code lives outside backend implementation paths.
- Project-local skills explain the draft, review, approve, and integrate phases.
