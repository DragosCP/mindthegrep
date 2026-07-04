# Architecture

## Runtime

DraftKit has four small parts:

- `SpecGraph`: deterministic behavior graph for UI, workflow, fixtures, and backend hints.
- Local draft data adapter/state: frontend-only draft behavior that makes the workflow feel real without becoming a product backend.
- `BulkTaggingDraftFlow`: user workflow controller that records state transitions while mutating local draft state.
- `BackendMapper`: converts an approved graph into backend implementation tasks.

## Invariants

- Draft and live modes should share the same app shell.
- Draft mode is frontend-only behavior and must not call real backend routes, production APIs, queues, migrations, or databases.
- Local draft data adapters may use in-memory data, fixtures, localStorage, IndexedDB, or similar browser-local state to make the workflow feel real.
- Local draft data adapters must model success and failure paths.
- A draft session must be based on a specific live checkpoint.
- Draft edits should be isolated from the live working tree through a worktree, sandbox, or overlay.
- If the live checkpoint moves while a draft exists, the draft should be reported as stale until the user explicitly refreshes/rebases, continues from the old baseline, or cancels.
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
  -> local draft data adapter
  -> spec action event
  -> .draftspec graph
  -> approval snapshot
  -> backend task mapping
```

## Draft And Live Isolation

The final architecture should not treat draft mode as a flag inside one mutable folder. A draft is a temporary isolated workspace based on a live checkpoint.

```text
live baseline: commit/tree abc123
draft session: isolated changes on top of abc123
```

This keeps product semantics clear:

- live preview serves the stable app;
- draft preview serves the isolated draft on a DraftKit-owned port;
- cancel discards the isolated draft;
- approval freezes the accepted behavior;
- go-live maps approved behavior onto the current app intentionally.

If the live app changes while a draft exists, DraftKit should not silently replay the draft on top of the new live state. It should mark the draft stale and require an explicit refresh/rebase, continue stale, or cancel decision.

## Session Runtime

`scripts/draftkit-session.mjs` owns the button runtime used by the project-local skills and npm scripts. Skills call it directly with `node ./scripts/draftkit-session.mjs ...` so Codex Desktop sessions opened from WSL UNC paths do not depend on relative npm script execution. It writes session-aware state under:

```text
.draftspec/state/draftkit-active.json
.draftspec/state/sessions/<session-id>/draftkit-state.json
.draftspec/logs/session-history.jsonl
```

The active mirror helps agents answer "what draft is open right now?" The session file is the durable runtime copy for that session. Status treats missing sessions, cwd drift, unhealthy previews, and dead recorded preview processes as stale state instead of silently trusting them.

`draft-cancel` clears the active mirror, marks the session cancelled, appends history, preserves draft and approved specs, and discards the isolated DraftKit-owned workspace. It only stops a preview process when the recorded process identity still proves DraftKit started it. If runtime state cannot prove draft edits are separated from live work, cancellation blocks with a recovery message instead of reverting user files by guesswork.

`draft-open <feature>` records the live baseline, creates or resumes isolated draft workspace/state, and previews an existing example route at `examples/<feature>/` when present. For new feature slugs it uses the generic `/draftkit/<feature>/` host, which renders the current `.draftspec` scaffold instead of claiming a feature-specific route exists. If no feature slug is supplied, it may resume an isolated active draft; otherwise it should fail instead of defaulting to a sample feature.

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
