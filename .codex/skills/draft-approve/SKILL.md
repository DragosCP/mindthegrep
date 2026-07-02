---
name: draft-approve
description: Freeze a validated DraftKit .draftspec workflow into an approved snapshot after tests and human workflow acceptance. Use when the builder says the draft workflow feels right and backend implementation may begin.
---

# Draft Approve

Freeze the draft workflow.

## Steps

1. Run the smallest relevant tests and spec validation.
2. Confirm the human has approved the clicked-through workflow.
3. Create an approved spec snapshot with a stable `snapshotId`.
4. Do not change backend code in this skill.

## Output

- Approved `.draftspec` file.
- Snapshot ID.
- Verification command output.
