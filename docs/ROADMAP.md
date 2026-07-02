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

- Package skills as a Codex plugin.
- Add OMX-compatible state handoffs.
- Add draft/live guardrails that block backend edits before approval.

## 0.4 Backend Integration

- Generate integration plans from approved specs.
- Compare generated routes/services against existing backend shape.
- Add duplicate-route risk checks.
