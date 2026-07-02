# PRD: DraftKit MVP

## Problem

Agent-built features often move directly from prose plans to backend implementation. When the workflow changes after human testing, backend routes and services retain the shape of failed UX attempts.

## Goal

Let a builder feel a feature in the real app shell before backend code is committed.

## MVP

Build a dependency-free DraftKit runtime and one example flow:

- bulk select 20 items
- open a tag dialog
- apply a tag optimistically
- simulate backend success
- simulate backend failure and rollback
- persist UI locations, states, actions, fixtures, and backend contract hints in `.draftspec`
- freeze an approved behavior graph
- map that graph to backend integration tasks

## Non-Goals

- No real database.
- No production auth.
- No full plugin marketplace packaging.
- No multi-framework adapter layer yet.
- No automatic GitHub PR creation unless network/auth is available.

## Success Criteria

- The user can click through the workflow locally.
- Draft mode never calls a real API.
- Every meaningful action is represented in the graph.
- Approval produces an immutable snapshot ID.
- Backend mapping refuses unapproved specs.
- Tests cover graph validation, flow replay, approval, and backend mapping.
