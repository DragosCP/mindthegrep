---
name: draft-integrate
description: Implement real backend integration from an approved DraftKit .draftspec snapshot. Use after draft approval to map fake behavior onto existing backend routes, services, tests, and data models without duplicating routes.
---

# Draft Integrate

Map approved draft behavior to the real backend.

## Rules

- Require an approved `.draftspec` with `status: "approved"` and `snapshotId`.
- Inspect existing backend routes and services before adding new ones.
- Prefer extending existing service boundaries over creating duplicate routes.
- Implement only the backend contracts named by the approved snapshot.
- Add tests for success and failure paths, especially rollback semantics.

## Output

- Backend changes tied to the snapshot ID.
- Tests proving the approved behavior.
- Notes for any contract mismatch between draft and backend.
