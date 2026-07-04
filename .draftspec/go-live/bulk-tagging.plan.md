# DraftKit Go-Live Plan: bulk-tagging

Generated: 2026-07-03T19:26:12.571Z
Approved snapshot: 87f0dd9677185722
Approved spec: `.draftspec/features/bulk-tagging.approved.json`
Backend target: `fixture-backend-sandbox`

## Behavior Summary

Select multiple items, tag them optimistically, and roll back on failure.

UI locations: items-route, bulk-tag-button, bulk-tag-dialog, failure-toggle
States: idle, selected, dialog_open, saving, success, rollback
Actions: select-items, open-bulk-tag-dialog, apply-tag-optimistic, bulk-tag-success, bulk-tag-rollback

## Backend Contracts

- bulkApplyTags: POST /items/bulk-tags

## Repository Boundaries

- Production backend target detected: no
- Backend-like files: 2
- Database files: 0
- Service files: 0
- Test files: 7

## Database Implications

- Fixture backend stores contract-level behavior only; production persistence remains a future adapter task.

## API Implications

- POST /items/bulk-tags

## Test Plan

- Validate approved spec snapshot before planning or implementation.
- Reject stale plans when snapshotId differs from the approved spec.
- Exercise fixture backend success and requested failure modes.

## Risks And Open Questions

- Repo has no production backend target; generated implementation is intentionally fixture-backed.
- Do not treat runtime DraftKit state as authorization for backend edits.
- Do not add duplicate production routes without adapter-specific discovery.

## Implementation Order

1. Load and validate approved .draftspec snapshot.
2. Confirm plan snapshotId matches approved snapshotId.
3. Write fixture backend implementation artifact from approved contracts.
4. Run DraftKit tests and spec validation.
