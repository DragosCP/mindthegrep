# Draft To Live Handoff

This is the canonical protocol for turning a validated DraftKit prototype into live backend work.

## Purpose

Draft mode exists so a builder can feel the workflow before backend code is committed. The live handoff starts only after the human approves the clicked-through draft. Until then, draft work stays in frontend code, fake adapters, local state, fixtures, and `.draftspec` artifacts.

## Protocol

1. Review the draft in the real app shell.
   - Click through the happy path, failure paths, empty states, and repeat-use paths.
   - Confirm the workflow feels right to the human reviewer.
   - Keep the draft spec in `status: "draft"` during this review.

2. Freeze the approved workflow.
   - Run tests and spec validation.
   - Create an approved `.draftspec` snapshot with `status: "approved"` and `snapshotId`.
   - Do not change backend code during approval.

3. Generate the backend integration plan.
   - Read only the approved snapshot.
   - Convert deferred/fake backend behavior into concrete backend tasks.
   - Name the backend contracts, route hints, data model changes, and tests required.

4. Inspect the existing backend.
   - Find current routes, services, models, repositories, migrations, and tests.
   - Prefer extending existing boundaries over adding duplicate routes or parallel services.
   - Record any mismatch between the approved draft contract and the existing backend shape.

5. Implement live backend integration.
   - Implement only the backend contracts named by the approved snapshot.
   - Replace fake/local draft behavior with real API-backed behavior.
   - Keep the visible workflow equivalent to the approved draft unless the human reopens draft review.

6. Verify live behavior against the approved draft.
   - Run backend/API tests.
   - Run the approved click-through path against the live integration.
   - Confirm persistence, reload behavior, success paths, and failure paths.
   - Confirm the draft-only protected files/checks are no longer the source of truth.

## Commands

The current MVP exposes this shape through scripts:

```bash
npm run approve:bulk-tagging
npm run map:bulk-tagging
```

The product should grow toward app-agnostic commands:

```bash
draftkit approve <feature>
draftkit plan-backend <feature>
draftkit integrate <feature>
draftkit verify-live <feature>
```

## Guardrails

- Draft approval requires human workflow acceptance.
- Backend implementation requires an approved snapshot.
- The integration plan must reference the approved `snapshotId`.
- Backend work must not be based on loose prose if an approved `.draftspec` exists.
- If backend constraints force UX behavior changes, return to draft review before implementing the changed workflow.

## Todo Board Example

In the manual Todo sandbox, the draft board used localStorage for `Tasks`, `In progress`, and `Done`. Once approved, the live handoff would produce backend work such as:

- add persisted task status to the data model
- add or extend a status update route, for example `PATCH /tasks/:id/status`
- keep existing task creation behavior intact
- replace localStorage draft status with API-backed status
- verify that moving a task and reloading preserves the selected column

The draft code is not the backend implementation. It is the approved behavior contract the backend must satisfy.
