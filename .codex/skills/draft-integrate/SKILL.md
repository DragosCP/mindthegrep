---
name: draft-integrate
description: Implement real backend integration from an approved DraftKit .draftspec snapshot. Use after draft approval to map approved draft behavior onto existing backend routes, services, tests, and data models without duplicating routes or changing architecture unexpectedly.
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
- Map behavior onto the app's existing backend/database architecture.
- Do not use DraftKit integration as a reason to switch backend or database architecture unless the user explicitly asks for that outside DraftKit.
- Add tests for success and failure paths, especially rollback semantics.

## Output

- Backend changes tied to the snapshot ID.
- Tests proving the approved behavior.
- Notes for any contract mismatch between draft and backend.
