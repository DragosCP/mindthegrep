# Draft To Live Handoff

This is the canonical protocol for turning a validated DraftKit prototype into live backend work.

## Purpose

Draft mode exists so a builder can feel the workflow before backend code is
committed. The live handoff starts only after the human approves the
clicked-through draft. Until then, draft work stays in frontend code, local
draft data adapters, browser-local state, fixtures, and `.draftspec` artifacts.

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
   - Convert deferred local draft behavior into concrete backend tasks.
   - Name the backend contracts, route hints, data model changes, and tests required.

4. Inspect the existing backend.
   - Find current routes, services, models, repositories, migrations, and tests.
   - Prefer extending existing boundaries over adding duplicate routes or parallel services.
   - Record any mismatch between the approved draft contract and the existing backend shape.

5. Implement live backend integration.
   - Implement only the backend contracts named by the approved snapshot.
   - Replace local draft behavior with real API-backed behavior.
   - Keep the visible workflow equivalent to the approved draft unless the human reopens draft review.

6. Verify live behavior against the approved draft.
   - Run backend/API tests.
   - Run the approved click-through path against the live integration.
   - Confirm persistence, reload behavior, success paths, and failure paths.
   - Confirm the draft-only protected files/checks are no longer the source of truth.

## Repeatable Loop

Draft mode is not a one-way path. The live app remains the baseline, and a builder can reopen draft mode later from whatever the live app has become.

The expected lifecycle is:

```text
live
  -> draft experiment
  -> discard or approve
  -> live integration
  -> new draft experiment
```

Rules:

- Starting a draft must branch from the current live UI, routes, and data shape.
- Each draft experiment gets its own `.draftspec` history or snapshot.
- Unapproved drafts may be discarded without changing live backend behavior.
- Approved drafts become live behavior only after integration and live verification.
- After integration, future drafts start from the updated live app, not from stale draft code.
- If a live implementation reveals a UX problem, reopen draft review instead of patching backend behavior from prose.

Practically, this means `draftkit:init` is a reusable bridge, not a one-time disposable sandbox. Once installed in a downstream app, every new draft starts from the current live code and writes a new `.draftspec/features/<feature>.json` file. Returning to live mode does not remove DraftKit; it changes the active work from draft-only UI to approved-snapshot backend integration.

## Commands

Install DraftKit into a downstream app:

```bash
npm run draftkit:init -- /path/to/app
```

Inside that app, capture the live baseline before draft edits:

```bash
npm run draftkit:protect:snapshot
```

Open and inspect a draft session:

```bash
npm run draftkit:open -- <feature>
npm run draftkit:status
npm run draftkit:cancel
```

Before draft review, verify the draft against that baseline:

```bash
npm run draftkit:validate
npm run draftkit:protect:check
```

The snapshot command belongs at the start of draft work, immediately after init or before the first draft edit. The check command belongs at review time. Do not create a fresh snapshot after draft changes just to make the check pass.

The open command records a live baseline and creates an isolated DraftKit-owned
workspace. The draft preview must run on a DraftKit-owned port with matching
preview identity; a generic local HTTP response is not enough.

The current repo still exposes the bulk-tagging vertical slice through scripts:

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
- UI-only drafts may use `backendContracts: []`.
- Deferred backend hints may use a backend contract with `current: "deferred"` or `mode: "deferred"`.
- Protected-file checks should snapshot live persistence/backend files before draft review and fail if a draft mutates them.

## Todo Board Example

In the manual Todo sandbox, the draft board used localStorage for `Tasks`, `In progress`, and `Done`. Once approved, the live handoff would produce backend work such as:

- add persisted task status to the data model
- add or extend a status update route, for example `PATCH /tasks/:id/status`
- keep existing task creation behavior intact
- replace localStorage draft status with API-backed status
- verify that moving a task and reloading preserves the selected column

The draft code is not the backend implementation. It is the approved behavior
contract the backend must satisfy.
