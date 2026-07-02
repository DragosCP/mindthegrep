# Architecture

## Runtime

DraftKit has four small parts:

- `SpecGraph`: deterministic behavior graph for UI, workflow, fixtures, and backend hints.
- `FakeBackend`: in-memory service adapter with the same semantic shape the real backend should later expose.
- `BulkTaggingDraftFlow`: user workflow controller that records state transitions while mutating local draft state.
- `BackendMapper`: converts an approved graph into backend implementation tasks.

## Invariants

- Draft and live modes should share the same app shell.
- Draft mode must not make network calls.
- The fake backend must model success and failure paths.
- Spec serialization must be deterministic.
- Backend mapping requires an approved spec.
- Approval creates a content-addressed snapshot ID.

## Data Flow

```text
User click
  -> flow controller
  -> fake backend/local state
  -> spec action event
  -> .draftspec graph
  -> approval snapshot
  -> backend task mapping
```

## Next Architecture Step

Add adapters for real projects:

- React hook wrapper
- MSW adapter for apps that already use HTTP boundaries
- route/location detector
- Playwright click-through harness
