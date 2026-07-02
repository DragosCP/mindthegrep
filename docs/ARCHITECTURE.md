# Architecture

## Runtime

DraftKit has four small parts:

- `SpecGraph`: deterministic behavior graph for UI, workflow, fixtures, and backend hints.
- `FakeBackend`: in-memory service adapter with the same semantic shape the real backend should later expose.
- `BulkTaggingDraftFlow`: user workflow controller that records state transitions while mutating local draft state.
- `BackendMapper`: converts an approved graph into backend implementation tasks.
- `draftkit:init`: downstream-app bridge that installs local skills, `.draftspec` validation, and protected-file checks.
- `ProtectedFiles`: hash snapshots of live backend, schema, route, and persistence files that draft mode must not mutate.

## Invariants

- Draft and live modes should share the same app shell.
- Draft mode must not make network calls.
- The fake backend must model success and failure paths.
- Spec serialization must be deterministic.
- Backend mapping requires an approved spec.
- Approval creates a content-addressed snapshot ID.
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
