---
name: draft-implement-to-live
description: Implement live integration only from an approved DraftKit snapshot, using a matching go-live plan or creating one first.
---

# Draft Implement To Live

Implement approved DraftKit contracts into the live target.

## Command

```bash
node ./scripts/draftkit-session.mjs implement-to-live <feature>
```

Use the direct Node command for Codex Desktop, WSL, and Linux sessions. Do not route this button through npm DraftKit aliases from a WSL UNC workspace.

## Rules

- Require an approved `.draftspec` snapshot with `status: "approved"` and `snapshotId`.
- Prefer an existing `.draftspec/go-live/<feature>.plan.json`.
- Reject stale plans whose `snapshotId` does not match the approved spec.
- If no plan exists, create one from the approved snapshot before implementing.
- Implement only backend contracts named by the approved snapshot.
- Do not use runtime state as authorization for backend edits.
- Map approved product behavior onto the existing app backend/database architecture.
- Do not use DraftKit go-live as a reason to switch backend or database architecture unless the user explicitly asks for that outside DraftKit.
- In this repository, implementation targets `fixtures/backend-sandbox/` because there is no production backend.

## Output

- Approved snapshot ID.
- Plan path.
- Implementation artifact path.
- Any mismatch between the approved draft behavior and existing live architecture.
- Verification commands or results.
