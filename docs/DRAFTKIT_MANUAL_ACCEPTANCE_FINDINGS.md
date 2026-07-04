# DraftKit Manual Acceptance Findings

Created: 2026-07-04

Source: first consumer install and todo draft run in a fresh `xyz_ex` project using the `codex/draftkit-buttons` branch.

## 1. Draft Preview Must Use A Dedicated Port

Issue: `draft-open` may reuse a healthy default preview port, such as `5173`, even when that port is already serving the live app. This makes it hard to compare the live app and draft app side by side.

Required behavior:

- `draft-open <feature>` should start or reuse a DraftKit-owned draft preview on a new available port.
- It should not reuse an externally owned live app port as the draft preview.
- It may reuse an existing DraftKit-owned preview for the same active feature/session.
- `draft-status` should report the draft preview URL clearly.
- Future UI/docs should distinguish live preview URL from draft preview URL when both exist.

Important nuance: a separate port is not enough if both servers read the same edited files. Side-by-side live/draft preview also needs a draft isolation strategy so live can remain stable while draft changes are explored.

Possible isolation strategies:

- serve draft routes from DraftKit-generated overlay files,
- keep draft-only routes under a dedicated draft path,
- use a temporary worktree or sandbox for draft edits,
- or preserve a committed live baseline and serve draft changes separately.

## 2. `draft-open` Needs Safer Feature Defaults

In a consumer project, invoking `draft-open` without an explicit feature should not fall back to a sample feature such as `bulk-tagging`.

Preferred behavior:

- if an active draft exists, resume that active feature;
- if no active draft exists, require or infer a feature slug from the prompt;
- avoid sample-specific defaults in installed consumer projects.

## 3. Install Should Hide Git Setup Details

The manual test required the user to care about whether the fresh folder was already a git repository. That is acceptable for a raw acceptance scaffold, but it should not be part of the product experience.

Target behavior for `npx draftkit init`:

- if git exists, update `.gitignore` and verify ignored runtime paths;
- if git is missing, install safely and explain that ignore behavior activates after `git init`;
- optionally support `npx draftkit init --init-git`;
- do not silently run `git init` by default.

## 4. Skill Discovery Needs Clear Session Guidance

Project-local `.codex/skills/draft-*` files may not appear in an already-open Codex session immediately after install.

Required behavior:

- installer output should say when a new Codex session/reload is needed;
- docs should provide direct Node command fallbacks for the current session;
- future installer should verify skill files exist and report their paths.

## 5. Draft UI Should Avoid Product-Facing Debug Labels

The draft app is meant to feel like the real product workflow. Labels such as `Draft`, implementation details, storage technology, or internal status should not become part of the user-facing product UI unless explicitly requested.

Preferred behavior:

- keep draft/debug metadata in agent output, status commands, or a separate development overlay;
- keep the product surface focused on the workflow a real user would experience.

## 6. Draft Iterations Must Preserve Accepted Constraints

Visual iteration prompts should not silently change accepted technical/product constraints. For example, a UI polish pass should not replace an accepted local database boundary with a weaker local storage approach unless the change is deliberate and recorded.

Required behavior:

- preserve previously accepted constraints across draft iterations;
- if a constraint changes, call it out and update the `.draftspec` graph;
- keep backend/storage hints aligned with the actual draft behavior.

## 7. Draft And Scaffold Checkpoints Need Clearer Phase Boundaries

The test correctly created an initial scaffold commit and left todo app draft changes uncommitted, but this phase boundary is easy for agents to blur.

Preferred behavior:

- installer/scaffold work should be checkpointed before product draft work begins;
- draft work should remain reviewable through git diff and `.draftspec/features/`;
- runtime state/logs should remain ignored local data.
