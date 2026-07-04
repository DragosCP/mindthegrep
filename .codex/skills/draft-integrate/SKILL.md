---
name: draft-integrate
description: Implement real backend integration from an approved DraftKit .draftspec snapshot. Use after draft approval to map fake behavior onto existing backend routes, services, tests, and data models without duplicating routes.
---

# Draft Integrate

Map approved draft behavior to the real backend.

For button-driven sessions, use `node ./scripts/draftkit-session.mjs implement-to-live <feature>` so the approved snapshot and go-live plan gates run first.

## Rules

- Require an approved `.draftspec` with `status: "approved"` and `snapshotId`.
- Refuse stale or missing go-live plans unless the implementation button creates a fresh plan from the approved snapshot first.
- Inspect existing backend routes and services before adding new ones.
- Prefer extending existing service boundaries over creating duplicate routes.
- Implement only the backend contracts named by the approved snapshot.
- Add tests for success and failure paths, especially rollback semantics.

## Output

- Backend changes tied to the snapshot ID.
- Tests proving the approved behavior.
- Notes for any contract mismatch between draft and backend.
