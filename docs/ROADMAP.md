# Roadmap

## 0.1 Local MVP

- Dependency-free DraftKit runtime.
- Bulk-tagging draft demo.
- `.draftspec` validation and approval.
- Backend task mapping.
- Project-local Codex skills.

## 0.2 Real App Adapter

- Add a React/Vite adapter.
- Add route and component location capture helpers.
- Add Playwright-based click-through traces.

## 0.3 Agent Workflow

- Project-local DraftKit button skills and npm scripts for status, open, cancel, plan-to-go-live, and implement-to-live.
- Direct Node button commands for Codex Desktop/WSL UNC reliability, with npm aliases kept for WSL/Linux shells and CI.
- Session-aware DraftKit runtime state under `.draftspec/state/`.
- Local ignored operational logs under `.draftspec/logs/`.
- Generic DraftKit preview host for new feature slugs before a feature-specific example route exists.
- Approval-gated go-live planning and fixture-backed implementation artifacts.
- Future: package the buttons as a Codex plugin with optional hooks for draft/live guardrails.
- Future: add Claude Code `/draft-*` wrappers if Claude support is in scope.

## 0.4 Backend Integration

- Extend go-live discovery with real app adapters.
- Compare generated routes/services against existing backend shape in production repositories.
- Add duplicate-route risk checks for framework-specific route systems.
- Replace the fixture backend sandbox with production backend implementations when a real backend target exists.
