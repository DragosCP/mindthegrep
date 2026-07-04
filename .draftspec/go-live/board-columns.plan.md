# DraftKit Go-Live Plan: board-columns

Generated: 2026-07-03T21:01:57.525Z
Approved snapshot: 97a4cf0cfbfaf60c
Approved spec: `.draftspec/features/board-columns.approved.json`
Backend target: `fixture-backend-sandbox`

## Behavior Summary

Draft workflow for trying a todo board as columns, moving tasks, iterating board settings placement, enforcing a four-column maximum, and making task categories always available before go-live.

UI locations: app-shell, board-route, board-toolbar, board-settings-entry, board-settings-dialog, columns-settings-section, category-settings-toggle, category-field, inline-category-creator, task-card, task-create-form
States: columns_visible, task_moved, settings_open, settings_relocated, column_added, max_columns_blocked, category_setting_enabled, task_created_with_category, categories_always_available, ready_for_approval
Actions: open-board-draft, move-task-to-in-progress, open-board-settings, move-settings-to-toolbar, add-fourth-column, block-fifth-column, enable-categories-draft-option, create-task-with-inline-category, make-categories-always-available, prepare-board-columns-go-live

## Backend Contracts

- saveBoardLayout: POST /boards/:boardId/layout
- moveTask: POST /boards/:boardId/tasks/:taskId/move
- saveBoardSettings: POST /boards/:boardId/settings
- saveTaskCategory: POST /boards/:boardId/categories

## Repository Boundaries

- Production backend target detected: no
- Backend-like files: 2
- Database files: 0
- Service files: 0
- Test files: 7

## Database Implications

- Fixture backend stores contract-level behavior only; production persistence remains a future adapter task.

## API Implications

- POST /boards/:boardId/layout
- POST /boards/:boardId/tasks/:taskId/move
- POST /boards/:boardId/settings
- POST /boards/:boardId/categories

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
