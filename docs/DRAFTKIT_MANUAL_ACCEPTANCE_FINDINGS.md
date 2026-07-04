# DraftKit Manual Acceptance Findings

Created: 2026-07-04

Source: first consumer install and todo draft run in a fresh `xyz_ex` project using the `codex/draftkit-buttons` branch.

## 1. Draft Cancel Must Restore The Live Baseline

Issue: `draft-cancel` currently exits DraftKit runtime state and may stop the DraftKit-owned preview, but it does not restore source files edited during the draft. In the manual test, cancelling the draft returned `mode: live` while the live app still showed the draft redesign because the same working tree files had been changed.

This violates the product expectation of a draft. A cancelled draft should be discarded, not merely marked inactive.

Required behavior:

- `draft-open <feature>` should record a pre-draft live baseline before draft edits begin.
- Draft edits should be associated with the active draft session.
- `draft-cancel` should discard or revert draft-session edits and return the app to the pre-draft live baseline.
- `draft-cancel` must not silently revert unrelated user work that existed before the draft opened.
- If the workspace has mixed unrelated changes and DraftKit cannot safely isolate its own edits, cancellation should block with a clear recovery path instead of pretending the draft was discarded.
- Product artifacts may be archived as cancellation evidence only when they do not keep the cancelled draft active in the app.
- `draft-approve` is the point where draft work becomes intentional product work; before approval, cancel should be able to throw it away.

Preferred implementation direction:

- use a temporary worktree or sandbox for draft edits, so cancel can discard the draft workspace cleanly;
- or maintain a robust baseline manifest/patch set that can revert only DraftKit-owned edits;
- avoid relying on runtime state alone as the source of truth for cancellation.

Acceptance check:

- after `draft-cancel`, starting or reloading the live app should show the pre-draft UI, not the cancelled draft UI.

## 2. Drafts Must Be Based On A Live Checkpoint

Issue: an "active draft" cannot safely mean loose edits in the same working tree as live work. If live files and draft files are both changing in one folder, DraftKit cannot clearly answer what live is, what cancel should restore, or what happens when live moves while a draft is open.

Required behavior:

- `draft-open <feature>` should record the live baseline, such as a commit or tree hash.
- Draft edits should happen in an isolated worktree, sandbox, or overlay based on that live baseline.
- `draft-status` should report the draft's live baseline and whether it is current or stale.
- If live changes after the draft opens, DraftKit should mark the draft stale.
- DraftKit should not silently patch/rebase a draft onto the new live state.

Required explicit choices when live moves:

- refresh/rebase the draft onto the new live baseline;
- continue the draft from the old baseline with a visible stale warning;
- cancel and discard the draft.

Product rule:

- DraftKit is for trying product behavior before backend implementation, not for trying a different backend/database architecture. Approved draft behavior should later be mapped onto the app's existing backend architecture.

## 3. Draft Preview Must Use A Dedicated Port

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

This is closely related to cancellation: if draft edits are isolated from the live baseline, `draft-cancel` can discard the draft cleanly instead of leaving the live app changed.

## 4. `draft-open` Needs Safer Feature Defaults

In a consumer project, invoking `draft-open` without an explicit feature should not fall back to a sample feature such as `bulk-tagging`.

Preferred behavior:

- if an isolated active draft session exists, resume that active feature;
- if no isolated active draft session exists, require or infer a feature slug from the prompt;
- avoid sample-specific defaults in installed consumer projects.

## 5. Install Should Hide Git Setup Details

The manual test required the user to care about whether the fresh folder was already a git repository. That is acceptable for a raw acceptance scaffold, but it should not be part of the product experience.

Target behavior for `npx draftkit init`:

- if git exists, update `.gitignore` and verify ignored runtime paths;
- if git is missing, install safely and explain that ignore behavior activates after `git init`;
- optionally support `npx draftkit init --init-git`;
- do not silently run `git init` by default.

## 6. Skill Discovery Needs Clear Session Guidance

Project-local `.codex/skills/draft-*` files may not appear in an already-open Codex session immediately after install.

Required behavior:

- installer output should say when a new Codex session/reload is needed;
- docs should provide direct Node command fallbacks for the current session;
- future installer should verify skill files exist and report their paths.

## 7. Draft UI Should Avoid Product-Facing Debug Labels

The draft app is meant to feel like the real product workflow. Labels such as `Draft`, implementation details, storage technology, or internal status should not become part of the user-facing product UI unless explicitly requested.

Preferred behavior:

- keep draft/debug metadata in agent output, status commands, or a separate development overlay;
- keep the product surface focused on the workflow a real user would experience.

## 8. Draft Iterations Must Preserve Accepted Constraints

Visual iteration prompts should not silently change accepted technical/product constraints. For example, a UI polish pass should not replace an accepted local database boundary with a weaker local storage approach unless the change is deliberate and recorded.

Required behavior:

- preserve previously accepted constraints across draft iterations;
- if a constraint changes, call it out and update the `.draftspec` graph;
- keep backend/storage hints aligned with the actual draft behavior.

## 9. Draft And Scaffold Checkpoints Need Clearer Phase Boundaries

The test correctly created an initial scaffold commit and left todo app draft changes uncommitted, but this phase boundary is easy for agents to blur.

Preferred behavior:

- installer/scaffold work should be checkpointed before product draft work begins;
- draft work should remain reviewable through git diff and `.draftspec/features/`;
- runtime state/logs should remain ignored local data.
