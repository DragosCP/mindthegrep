# Long Horizon Validation Plan

This is the durable plan for proving whether DraftKit helps real agent workflows instead of interfering with them.

## Current Status

Done:

- First manual sandbox test in two steps:
  - build a baseline Todo app with one task list and a small local database
  - enter draft mode and add `Tasks`, `In progress`, and `Done` columns with fake UI state
- Manual sandbox findings documented in `docs/MANUAL_SANDBOX_TEST.md`.
- Draft/live lifecycle documented in `docs/DRAFT_TO_LIVE.md`.
- Reusable downstream bridge implemented through `npm run draftkit:init -- <target-app>`.
- App-agnostic `.draftspec` validation added.
- Protected-file snapshot/check guardrails added.
- UI-only and deferred-backend draft semantics added.
- Ralph/DraftKit research captured in `docs/RALPH_DRAFTKIT_FINDINGS.md`.
- Prompt catalog started in `docs/MANUAL_TEST_PROMPTS.md`.

## Principle

Test vague prompts in real sandboxes. Do not overfit the product by giving the agent perfect instructions.

DraftKit succeeds only if the agent naturally understands:

- live app shell stays intact
- draft behavior is frontend-only
- backend/database files are protected until approval
- `.draftspec` is the durable workflow memory
- the human feel-test is a real gate

## Phase 1: Codex CLI Manual Test Round 2

Goal:

- Stress the Live -> Draft -> Live -> Draft loop in a real Todo sandbox.

Setup:

- create a new sandbox path
- run Codex CLI from that path
- install DraftKit bridge with `npm run draftkit:init -- <sandbox>`
- snapshot protected files before draft edits
- commit after each prompt

Prompts:

- Prompt 1: build baseline Todo app
- Prompt 2: draft three-column board
- Prompt 3: improve UI in place
- Prompt 4: move tasks between columns
- Prompt 5: propose Settings location
- Prompt 6: move Settings location
- Prompt 7: manage board columns from Settings
- Prompt 8: enable categories and inline category creation
- Prompt 9: remove category toggle and prepare for live integration
- Prompt 10: add a Habits and Goals page in draft

Acceptance evidence:

- tests pass
- protected-file check passes during draft work
- `.draftspec` validates after every draft prompt
- app remains visually and structurally one app
- draft can resume across sessions
- live integration references an approved snapshot

Output:

- new manual-test report under `docs/`
- exact prompt transcript
- what failed
- what product/code/docs changed because of the test

## Phase 2: Implement Fixes From Round 2

Goal:

- Convert test findings into product improvements quickly.

Likely work:

- clearer draft/live state machine
- explicit `open`, `park`, `discard`, `approve`, and `integrate` draft lifecycle states
- better `.draftspec` history for multiple draft iterations
- browser click-through trace capture
- stronger protected-file defaults
- better instructions for open draft vs live work

Acceptance evidence:

- focused tests for each product change
- one quick manual re-test of the failing path
- docs updated with new behavior

## Phase 3: Claude Code CLI Territory

Goal:

- Repeat the same validation in Claude Code CLI after Codex CLI behavior is understood.

Setup:

- new branch or PRD
- new sandbox
- install DraftKit bridge
- use the same prompt catalog where possible
- use OMX/Codex to capture findings, but let Claude Code CLI be the tested agent

Round 1:

- run 2-3 core prompts
- document what worked and what failed
- implement fixes

Round 2:

- run stress prompts
- document results
- implement fixes

Round 3:

- quick regression run if needed
- document final gaps

## Phase 4: Ralph-Native Contract

Goal:

- Make DraftKit consumable as smaller Ralph-compatible PRDs.

Candidate commands:

```text
draftkit ralph-prd <feature>
draftkit verify-draft <feature>
draftkit approve <feature>
draftkit backend-prd <approved-snapshot>
```

Expected Ralph PRD split:

- draft workflow only
- draft revision only
- live backend integration from approved snapshot only

Acceptance evidence:

- Ralph stops at human feel review
- Ralph does not mutate backend files during draft PRDs
- Ralph integration PRD references approved `snapshotId`
- completion audit maps prompt requirements to `.draftspec`, tests, protected-file checks, and live verification

## Phase 5: Non-CLI Runner UX

Goal:

- Make DraftKit understandable for Codex Desktop, Claude Code Desktop, and other non-terminal users.

Hypothesis:

- use MCP, plugin surfaces, or an app-local overlay to expose draft/live state
- support simple invocations like `@draft` or `$draft`
- show current mode in the preview itself

Possible UI:

- floating movable toolbar on top of the app
- bottom bar with `Live`, `Draft`, `Approve`, `Discard`, `Park`, `Integrate`
- small indicator for protected-file status
- button to open the current `.draftspec`

Manual test:

- run Codex Desktop and Claude Code Desktop in an isolated VM or equivalent safe environment
- create the same Todo sandbox
- run prompts from `docs/MANUAL_TEST_PROMPTS.md`
- observe whether non-CLI users can understand state transitions without reading terminal logs

Acceptance evidence:

- user can see whether they are in live or draft mode
- user can approve/discard/park without knowing implementation details
- agent and UI agree about active mode
- preview remains inside the real app shell

## Phase 6: Iterate Across Surfaces

For each surface:

1. Run first manual test.
2. Capture results.
3. Implement fixes.
4. Run second manual test.
5. Capture results.
6. Implement fixes.
7. Run one quick regression test if needed.

Surfaces:

- Codex CLI
- Codex Desktop
- Claude Code CLI
- Claude Code Desktop
- OMX/Ralph loop
- OMX/Autopilot or Ultragoal loop

## Open Decisions

- Should open drafts block live edits until they are approved, parked, or discarded?
- If live edits are allowed while a draft is open, how does the draft rebase?
- Should DraftKit own a visible in-app overlay, or should host apps render their own controls?
- Should fake backend data live in `.draftspec`, localStorage, fixtures, or a dedicated draft runtime store?
- How much should DraftKit infer automatically versus ask the user?
