# Project Memory Index

This file points future agents and humans to the durable context behind the DraftKit MVP.

## Original Idea Seed

- Context snapshot: `.omx/context/let-me-describe-the-project-i-m-trying-to-build-20260702T113345Z.md`
- Autopilot state: `.omx/state/sessions/019f1fd4-8214-7143-8212-284c4e00ba47/autopilot-state.json`
- Session id: `019f1fd4-8214-7143-8212-284c4e00ba47`
- Outcome: Autopilot was cancelled intentionally because the request was exploratory/conversational, not hands-off implementation.
- Important gap: `deep_interview` is `null`; there is no completed questionnaire artifact yet. The original context snapshot is the best current source for the founder intent.

## First Manual Sandbox

- Context snapshot: `.omx/context/manual-draftkit-todo-sandbox-20260702T150200Z.md`
- Main report: `docs/MANUAL_SANDBOX_TEST.md`
- Sandbox path: `/home/drago/mindthegrep-sandboxes/todo-draftkit-manual`
- Sandbox commits:
  - `a3491c7` - baseline Todo app
  - `3ea5c3a` - DraftKit sandbox bridge
  - `84e3424` - draft task board columns

## Current Product Docs

- MVP PRD: `docs/PRD.md`
- Architecture: `docs/ARCHITECTURE.md`
- Draft/live handoff: `docs/DRAFT_TO_LIVE.md`
- Roadmap: `docs/ROADMAP.md`
- Manual test prompts: `docs/MANUAL_TEST_PROMPTS.md`
- Long-horizon validation plan: `docs/LONG_HORIZON_VALIDATION_PLAN.md`
- Ralph/DraftKit findings: `docs/RALPH_DRAFTKIT_FINDINGS.md`

## Current GitHub State

- Repository: `https://github.com/DragosCP/mindthegrep`
- Main PR: `https://github.com/DragosCP/mindthegrep/pull/1`
- Current feature branch at time of this note: `draftkit-mvp`

## Memory Rule

When future work adds new manual tests, Ralph runs, Claude Code tests, Codex Desktop tests, or non-CLI runner tests, add:

- the exact prompt text
- the harness used
- the sandbox path
- the live/draft state at start and end
- what was expected
- what actually happened
- what code/docs changed because of the run
