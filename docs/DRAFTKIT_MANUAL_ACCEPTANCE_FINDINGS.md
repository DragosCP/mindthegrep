# DraftKit Manual Acceptance Findings

Created: 2026-07-04

## Blocking Finding From The Learning Branch

The `codex/draftkit-buttons` learning branch proved baseline capture,
workspace isolation, stale detection, and cancel semantics, but manual consumer
testing found a critical preview ownership failure:

- live app was already running on port `5173`;
- `draft-open todo` reported `http://localhost:5173/draftkit/todo/` as a
  DraftKit-owned healthy draft preview;
- the DraftKit preview process failed with `EADDRINUSE`;
- `draft-status` still reported healthy because the live server returned HTTP
  200;
- a marker written only into the isolated draft workspace was not visible in the
  reported draft preview.

Conclusion: preview health must be identity based. A generic HTTP 200 is not a
DraftKit ownership proof.

## Clean Branch Fix

The clean runtime:

- allocates a free preview port when the default live port is occupied;
- starts a DraftKit-owned preview server from the isolated draft workspace;
- gives the preview process a session token;
- exposes a private `__draftkit/preview-identity` endpoint;
- verifies token, session ID, feature, PID, and workspace cwd;
- marks status stale when identity is missing, dead, or mismatched;
- stops a preview process only after identity matches.

## Acceptance Requirements

- Cancel must discard draft-session edits and leave unrelated live work intact.
- Drafts must be based on a recorded live checkpoint.
- Live movement after draft open must mark the draft stale.
- Draft preview must be on a DraftKit-owned port, separate from an external live
  preview.
- `draft-open` must not fall back to sample features in consumer projects.
- Product UI must not expose runtime, storage, framework, or debug details.
- Go-live work must start from an approved snapshot with `status: "approved"`
  and `snapshotId`.
