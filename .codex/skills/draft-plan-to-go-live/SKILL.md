---
name: draft-plan-to-go-live
description: Create DraftKit go-live plan artifacts only from an approved .draftspec snapshot with status:"approved" and snapshotId.
---

# Draft Plan To Go Live

Create a go-live plan from an approved DraftKit snapshot.

## Command

```bash
node ./scripts/draftkit-session.mjs plan-to-go-live <feature>
```

Use the direct Node command for Codex Desktop, WSL, and Linux sessions. Do not route this button through npm DraftKit aliases from a WSL UNC workspace.

## Rules

- Require `.draftspec/features/<feature>.approved.json`.
- Refuse unapproved or invalid moving drafts.
- Validate `status: "approved"` and `snapshotId`.
- Inspect repository backend, API, database, service, and test boundaries.
- Write `.draftspec/go-live/<feature>.plan.md` and `.draftspec/go-live/<feature>.plan.json`.
- Tie every plan to the approved snapshot ID.
- Do not implement backend code in this button.

## Output

- Plan artifact paths.
- Approved snapshot ID.
- Backend target summary.
- Next valid go-live action.
