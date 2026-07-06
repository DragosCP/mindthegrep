# PRD: DraftKit MVP

## Problem

Agent-built features often move directly from prose plans to backend implementation. When the workflow changes after human testing, backend routes and services retain the shape of failed UX attempts.

## Goal

Let a builder feel a feature in the real app shell before backend code is committed.

## MVP

Build a dependency-free DraftKit runtime, a downstream-app bridge, and one
example flow:

- bulk select 20 items
- open a tag dialog
- apply a tag optimistically
- simulate backend success
- simulate backend failure and rollback
- persist UI locations, states, actions, fixtures, and backend contract hints in `.draftspec`
- freeze an approved behavior graph
- map that graph to backend integration tasks
- install project-local DraftKit skills and runtime commands into a downstream
  app
- open isolated draft sessions from a live baseline
- serve draft previews on DraftKit-owned identity-verified ports

## Non-Goals

- No real database.
- No production auth.
- No published npm package yet.
- No multi-framework adapter layer yet.
- No automatic GitHub PR creation unless network/auth is available.

## Success Criteria

- The user can click through the workflow locally.
- Draft mode never calls real backend routes, production APIs, queues,
  migrations, or databases.
- Every meaningful action is represented in the graph.
- Approval produces an immutable snapshot ID.
- Backend mapping refuses unapproved specs.
- Tests cover graph validation, flow replay, approval, backend mapping, draft
  session isolation, preview identity, stale state, and cancellation.
