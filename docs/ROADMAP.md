# Roadmap

## 0.1 Local MVP

- Dependency-free DraftKit runtime.
- Bulk-tagging draft demo.
- `.draftspec` validation and approval.
- Backend task mapping.
- Project-local Codex skills.

## 0.2 Real App Adapter

- Harden the initial `draftkit:init` sandbox bridge for downstream apps.
- Add a React/Vite adapter.
- Add route and component location capture helpers.
- Expand protected-file checks for database, schema, route, and persistence files during draft mode.
- Add Playwright-based click-through traces.
- Expand UI-only and deferred-backend draft semantics with richer schema documentation.

## 0.3 Agent Workflow

- Project-local DraftKit button skills and direct Node runtime commands for
  `draft-status`, `draft-open`, `draft-cancel`, `draft-plan-to-go-live`, and
  `draft-implement-to-live`.
- Session-aware runtime state under `.draftspec/state/` with local history under
  `.draftspec/logs/`.
- Isolated draft workspaces based on a recorded live baseline.
- DraftKit-owned preview ports with identity-based health checks.
- Read-only status reporting for baseline, workspace, preview identity, stale
  reasons, and next actions.
- Cancellation that deletes only isolated DraftKit-owned draft state and
  preserves unrelated live work.
- Approval-gated go-live planning and implementation from snapshots with
  `status: "approved"` and `snapshotId`.
- Generic preview fallback for feature slugs that do not yet have an example
  route, without exposing implementation/debug labels in product UI.
- Future: package the buttons as a Codex plugin with optional hooks for
  draft/live guardrails.

## 0.4 Backend Integration

- Generate integration plans from approved specs.
- Compare generated routes/services against existing backend shape.
- Add duplicate-route risk checks.
