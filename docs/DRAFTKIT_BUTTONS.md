# DraftKit Button Runtime

Created: 2026-07-04

## Purpose

DraftKit exposes local button commands for draft workflows:

```bash
node ./scripts/draftkit-session.mjs status
node ./scripts/draftkit-session.mjs open <feature>
node ./scripts/draftkit-session.mjs cancel
node ./scripts/draftkit-session.mjs plan-to-go-live <feature>
node ./scripts/draftkit-session.mjs implement-to-live <feature>
```

The runtime enforces hard truth and safety contracts only. Agent behavior
guidance lives in `.codex/skills/draft-*`.

## Runtime Contracts

- `draft-open <feature>` requires a feature unless an isolated active draft can
  be resumed.
- Consumer flows do not default to `bulk-tagging`; the sample shortcut is
  explicit: `npm run draftkit:open:bulk-tagging`.
- Open records the live baseline before draft work begins.
- Open creates a DraftKit-owned isolated workspace under `.draftspec/state/`.
- Draft preview runs on a DraftKit-owned free port, not an externally owned live
  app port.
- Draft preview is served by `scripts/draftkit-preview-server.mjs`, separate
  from any consumer-owned live dev server script.
- Preview health requires a matching identity endpoint. A generic HTTP 200 is
  not enough.
- Identity must match token, session ID, feature, process ID, and draft
  workspace cwd.
- Port checks use the same host/bind behavior as the preview server and retry
  instead of accepting an externally owned live port. This matters on
  Windows/Codex Desktop, where a live server may occupy the all-interface port
  even when a narrower localhost probe appears available.
- `draft-status` is read-only and reports baseline, workspace, preview identity
  health, stale reasons, and next valid actions.
- If live moves after draft open, status marks the draft stale and does not
  silently rebase.
- `draft-cancel` deletes only isolated DraftKit-owned draft workspace/state and
  leaves unrelated live work intact.
- Go-live planning and implementation require
  `.draftspec/features/<feature>.approved.json` with `status: "approved"` and
  `snapshotId`.

## Runtime State

Ignored local operational state:

```text
.draftspec/state/draftkit-active.json
.draftspec/state/sessions/<session-id>/draftkit-state.json
.draftspec/state/workspaces/<session-id>/
.draftspec/logs/session-history.jsonl
```

Reviewable product artifacts:

```text
.draftspec/features/<feature>.json
.draftspec/features/<feature>.approved.json
.draftspec/go-live/<feature>.plan.md
.draftspec/go-live/<feature>.plan.json
fixtures/backend-sandbox/features/<feature>.implementation.json
```

Runtime state coordinates draft sessions. It never authorizes backend work.

## Skill Guidance Boundary

The skill files tell agents to:

- stay in draft mode until the user asks for live/go-live;
- keep draft work frontend-only;
- use local draft data, fixtures, and browser-local persistence;
- avoid real backend, database, API, queue, and migration edits during drafts;
- preserve accepted constraints across iterations;
- keep DraftKit/storage/framework internals out of product UI.

## Manual Acceptance

A clean run is acceptable only when it proves:

- live and draft previews run side by side on different ports;
- the draft preview serves the isolated workspace;
- live preview remains unchanged;
- dead or mismatched preview identity is unhealthy/stale;
- cancel removes draft-visible changes from live;
- unrelated live work survives cancel;
- live movement marks the draft stale;
- opening without a feature fails when no isolated active draft exists;
- product UI does not expose implementation or debug details.
