# Manual Test Prompts

This document stores deliberately vague prompts for manual DraftKit validation. The prompts should not over-teach the agent. We want to discover whether the agent reads the local skills, respects live/draft boundaries, preserves the app shell, and records useful `.draftspec` artifacts.

## Test Rules

- Use a fresh sandbox for each major run.
- Commit after every meaningful phase.
- Capture the exact prompt text.
- Prefer vague product language over implementation instructions.
- Snapshot protected files before draft edits.
- Validate with tests, served app smoke checks, `.draftspec` validation, protected-file checks, and git diffs.
- Record whether the agent created standalone/demo UI instead of working inside the existing app shell.

## Baseline Prompt Set

### Prompt 1: Build Live Baseline

Use this in a new empty sandbox path.

```text
Build a tiny todo app here. It should have a list of tasks and a small local database. Keep it simple.
```

Expected behavior:

- agent creates a runnable app
- app has one live task list
- tasks persist through a small local database/file
- tests or smoke checks exist
- git commit captures baseline

Evidence to capture:

- app URL
- commands to run app/tests
- database path
- route/API shape
- git commit hash

### Prompt 2: Enter Draft Mode And Add Columns

Use after installing or making DraftKit available in the sandbox.

```text
Now in draft mode, I want to see this as three columns instead of one list: tasks, in progress, and done. I want to click around and feel it first.
```

Expected behavior:

- agent keeps the existing app shell
- no backend/database/schema changes
- UI shows `Tasks`, `In progress`, and `Done`
- fake state is local, fixture-based, or localStorage-backed
- `.draftspec/features/<feature>.json` records UI, states, actions, fixtures, and deferred backend hints

Evidence to capture:

- `npm test`
- `npm run draftkit:validate`
- `npm run draftkit:protect:check`
- served HTML smoke checks
- git diff from baseline

## Second-Round Stress Prompts

### Prompt 3: Improve The UI In Place

```text
Make this feel more like a proper app. Keep the same product, but make the screen feel easier to use.
```

What this tests:

- whether the agent preserves the existing app instead of creating a standalone presentation page
- whether it keeps UI changes inside the same app shell
- whether it avoids debug panels and implementation-facing UI

Watch for:

- marketing-style landing pages
- separate preview pages
- terminal-like controls for end users
- changes to backend files during draft mode

### Prompt 4: Move Tasks Around

```text
I want to be able to move tasks around between the columns and feel how that works.
```

What this tests:

- local/fake interaction behavior
- drag/drop or simple move controls
- state persistence across reload if fake persistence is appropriate
- `.draftspec` action recording for move events

### Prompt 5: Ask Agent To Propose Settings Location

```text
I think we need settings for this board. Where should that live in the UI?
```

What this tests:

- whether the agent proposes UI placement before building
- whether it stays in draft mode
- whether the proposal references the existing app shell
- whether it records proposed locations in draft artifacts

### Prompt 6: Move The Settings Location

```text
Put that settings entry somewhere else. I want to try a different location before deciding.
```

What this tests:

- whether draft iteration persists across sessions
- whether previous draft decisions remain traceable
- whether the agent can revise UI placement without backend edits

### Prompt 7: Board Settings With Fake Backend

```text
When I open settings, I want to manage the board columns. Let me add one more column, but no more than four total.
```

Expected workflow:

- user clicks Settings
- a dialog or panel opens
- panel has simple navigation or grouped settings
- user opens Columns
- user adds a fourth column, for example `Almost done`
- apply/save updates the main board
- max four columns is enforced in the draft
- fake data is recorded in local state or fixtures

What this tests:

- multi-step workflow quality
- fake backend behavior
- action/state recording in `.draftspec`
- whether constraints are understandable to the user

### Prompt 8: Category Toggle And Inline Creation

```text
I want to try categories for tasks. Maybe there is a setting for that, and when it is on I can add a category while creating a task.
```

Expected workflow:

- user can enable categories in draft settings
- new task flow shows category choice only when enabled
- user can select existing category or create a new one on the spot
- category has a visible color
- fake category data is stored as draft-only state

What this tests:

- conditional workflow
- nested fake data
- whether generated words/content matter less than the workflow
- whether the agent keeps end-user UI clean

### Prompt 9: Change Before Live Integration

```text
Actually, I do not want a setting for categories. Make categories always available, then prepare this to become real.
```

What this tests:

- whether the agent updates the draft before live integration
- whether it avoids mixing live backend work with unapproved draft changes
- whether it can produce a revised approved snapshot before backend work

### Prompt 10: Add A New Habits Page In Draft

```text
Now I want to try a new page for habits and goals. It should feel like the same app, but the data can be fake.
```

What this tests:

- route/page creation in draft mode
- layout and branding consistency
- fake data for a new workflow
- whether page-level UI is recorded in `.draftspec`

## Live/Draft Boundary Edge Cases

Use these prompts when a draft is open.

### Prompt 11: Ambiguous Live Work While Draft Exists

```text
Add a small improvement to the app.
```

Question to answer:

- Does the agent ask whether this belongs to live mode or the open draft?
- Does it silently mutate live code?
- Does it preserve or close the draft?

### Prompt 12: Explicit Live Work While Draft Exists

```text
Back in live mode, add a small real change to the todo app.
```

Question to answer:

- Does DraftKit require `approve`, `discard`, or `park` before live edits?
- If live edits are allowed, does the open draft rebase cleanly from the new live state?

### Prompt 13: Resume Draft After Live Change

```text
Go back to the draft and continue where we left off.
```

Question to answer:

- Does the agent find the existing `.draftspec`?
- Does it preserve prior draft intent?
- Does it detect conflicts with live changes?

## Failure Modes To Capture

- backend/database file changed during draft mode
- agent creates a standalone demo page
- agent adds debugging UI for end users
- `.draftspec` is missing action/state/fixture entries
- draft cannot be resumed in a new session
- live work silently tramples open draft work
- approved snapshot is ignored during backend integration
- agent implements backend from prose instead of from `.draftspec`
