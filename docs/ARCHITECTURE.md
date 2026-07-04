# Architecture

## Runtime

DraftKit has four small parts:

- `SpecGraph`: deterministic behavior graph for UI, workflow, fixtures, and backend hints.
- `FakeBackend`: in-memory service adapter with the same semantic shape the real backend should later expose.
- `BulkTaggingDraftFlow`: user workflow controller that records state transitions while mutating local draft state.
- `BackendMapper`: converts an approved graph into backend implementation tasks.
- `draftkit-session`: local button runtime for opening, inspecting, cancelling,
  planning, and implementing approved draft sessions.
- `draftkit:init`: downstream-app bridge that installs local skills, `.draftspec` validation, and protected-file checks.
- `ProtectedFiles`: hash snapshots of live backend, schema, route, and persistence files that draft mode must not mutate.

## Invariants

- Draft and live modes should share the same app shell.
- Draft mode must not make network calls.
- The fake backend must model success and failure paths.
- Spec serialization must be deterministic.
- Backend mapping requires an approved spec.
- Approval creates a content-addressed snapshot ID.
- Draft session runtime state never authorizes backend work.
- `draft-open <feature>` requires an explicit feature unless an isolated active
  draft can be resumed.
- Draft preview health requires matching DraftKit identity: token, session ID,
  feature, PID, and draft workspace cwd.
- `draft-status` is read-only and reports stale state instead of repairing or
  rebasing drafts.
- `draft-cancel` discards only isolated DraftKit-owned workspace/state and must
  not revert unrelated live work.
- Go-live planning and implementation require an approved snapshot with
  `status: "approved"` and `snapshotId`.

## Button Runtime Boundary

Runtime enforces hard truth and safety contracts: baseline capture, workspace
isolation, preview ownership, identity health, stale detection, safe
cancellation, and approved-snapshot gates.

Agent behavior guidance belongs in `.codex/skills/draft-*`: stay frontend-only
while drafting, use local draft data/fixtures/browser-local state, preserve
accepted constraints, and keep implementation details out of product UI.
- UI-only drafts may have no backend contracts.
- Deferred backend contracts are planning hints until the draft is approved.
- Protected-file checks must pass before a draft is claimed ready for review.

## Data Flow

```text
User click
  -> flow controller
  -> fake backend/local state
  -> spec action event
  -> .draftspec graph
  -> protected-file check
  -> approval snapshot
  -> backend task mapping
```

The full live-backend handoff protocol is defined in [Draft To Live Handoff](DRAFT_TO_LIVE.md).

## Next Architecture Step

Add adapters for real projects:

- React hook wrapper
- MSW adapter for apps that already use HTTP boundaries
- route/location detector
- Playwright click-through harness
