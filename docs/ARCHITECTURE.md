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
- DraftKit runtime state never authorizes backend work.
- Go-live planning and implementation require an approved `.draftspec` snapshot with `status: "approved"` and `snapshotId`.
- `.draftspec/state/` and `.draftspec/logs/` are local operational data; `.draftspec/features/`, approved snapshots, and go-live plans are product artifacts.

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

## Session Runtime

`scripts/draftkit-session.mjs` owns the button runtime used by the project-local skills and npm scripts. Skills call it directly with `node ./scripts/draftkit-session.mjs ...` so Codex Desktop sessions opened from WSL UNC paths do not depend on relative npm script execution. It writes session-aware state under:

```text
.draftspec/state/draftkit-active.json
.draftspec/state/sessions/<session-id>/draftkit-state.json
.draftspec/logs/session-history.jsonl
```

The active mirror helps agents answer "what draft is open right now?" The session file is the durable runtime copy for that session. Status treats missing sessions, cwd drift, unhealthy previews, and dead recorded preview processes as stale state instead of silently trusting them.

`draft-cancel` clears the active mirror, marks the session cancelled, appends history, and preserves draft and approved specs. It only stops a preview process when the recorded process identity still proves DraftKit started it.

`draft-open <feature>` previews an existing example route at `examples/<feature>/` when present. For new feature slugs it uses the generic `/draftkit/<feature>/` host, which renders the current `.draftspec` scaffold instead of claiming a feature-specific route exists.

## Go-Live Gates

`draft-plan-to-go-live` and `draft-implement-to-live` load `.draftspec/features/<feature>.approved.json` and validate the approved snapshot before doing anything authoritative. Unapproved drafts and invalid approved snapshots are refused.

Go-live plans are written to:

```text
.draftspec/go-live/<feature>.plan.md
.draftspec/go-live/<feature>.plan.json
```

Plans include the approved `snapshotId`, backend contracts, repository boundary discovery, test plan, risks, and implementation order. `draft-implement-to-live` rejects stale plans whose `snapshotId` differs from the current approved snapshot.

This repository has no production backend/API/database target, so approved implementation writes fixture-backed artifacts under `fixtures/backend-sandbox/`. That sandbox is a realistic contract target for tests; it is not presented as a production backend.

## Next Architecture Step

Add adapters for real projects:

- React hook wrapper
- MSW adapter for apps that already use HTTP boundaries
- route/location detector
- Playwright click-through harness
