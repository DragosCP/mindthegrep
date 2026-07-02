# Workflow

Created: 2026-07-02

Purpose: define how this workspace should be used before the actual product idea is introduced.

This is not the PRD for the future project. It is the operating method: how the owner, Codex, OMX, Git, and GitHub should work together in a careful, repeatable loop.

The owner is not expected to be a developer. The workflow should make technical work legible, reviewable, reversible, and contribution-friendly.

## Core Idea

Use Codex/OMX as a project operating system.

Default rhythm:

```text
clarify
-> plan
-> review the plan
-> implement a small slice
-> verify
-> review the code
-> fix
-> document
-> checkpoint memory
-> repeat
```

This is Ralph-like: persistent, evidence-driven, and willing to loop until the work is actually clean.

## Owner Role

The owner decides:

- what the product is trying to achieve
- who it is for
- what the MVP includes
- what is out of scope
- what should be public
- which license to use
- which GitHub issues matter
- whether a PR should merge
- whether a decision becomes durable project memory

The owner should not need to manually manage every command, branch, test, review, or file edit.

## Agent Role

The agent should:

- ask clarifying questions before assuming product intent
- read `AGENTS.md`, this workflow, and relevant docs before acting
- explain technical choices in beginner-friendly language
- keep changes small and reversible
- create artifacts that future agents and contributors can read
- run verification before claiming success
- summarize risks and tradeoffs clearly
- never publish, merge, delete, or expose sensitive material without explicit owner approval

## Working Surfaces

| Surface | Use |
| --- | --- |
| Codex App on Windows | Comfortable conversation, docs, normal edits, review, lightweight GitHub work |
| Codex CLI in WSL | Full OMX workflows, tmux/team loops, Linux-native tooling |
| GitHub CLI | Creating issues, PRs, labels, milestones, repo operations |
| GitHub web UI | Owner-facing final review, repository settings, public presentation |

Current practical rule: do not rely on Codex Desktop WSL-agent mode. It was unstable in this setup. Use WSL CLI directly for full OMX strength.

## Default Workflow

### 1. Clarify

Use when the idea is fuzzy, broad, or emotionally important.

Preferred OMX surface:

```text
$deep-interview
```

Expected output:

- founder-friendly idea brief
- target users
- problem statement
- goals
- non-goals
- MVP boundaries
- risks
- open questions

Stop condition:

- the owner can explain the project in one or two sentences
- the MVP is small enough to start
- major assumptions are visible

### 2. Plan

Use when the idea is clear enough to become a working project.

Preferred OMX surface:

```text
$ralplan
```

or:

```text
$plan
```

Expected output:

- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/CONTRIBUTOR_TASKS.md`

The plan must include:

- what will be built
- why it matters
- what is not being built
- user flows
- technical assumptions
- risk list
- test plan
- acceptance criteria
- first issues to create

Stop condition:

- owner approves the plan
- reviewer/critic concerns are addressed or explicitly accepted

### 3. Prepare the Repository

Use when the plan is approved and the project should become GitHub-ready.

Expected output:

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `.github/ISSUE_TEMPLATE/*`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/ci.yml`
- `.gitignore`

Owner approval is required before:

- creating a public GitHub repository
- choosing a license
- pushing private/local work to GitHub
- enabling external services

### 4. Decompose Into Issues

Turn the plan into small pieces.

Issue categories:

- good first issue
- documentation
- design
- frontend
- backend
- testing
- bug
- feature
- needs decision

Each issue should explain:

- goal
- why it matters
- scope
- out of scope
- acceptance criteria
- helpful files/docs

Stop condition:

- issues are small enough for one branch/PR
- good-first issues are genuinely approachable

### 5. Implement One Slice

Work on one issue at a time.

Default command shape:

```text
Implement issue #N.
Read AGENTS.md and relevant docs first.
Keep scope limited to this issue.
Create or use a feature branch.
Add or update tests when meaningful.
Run verification.
Do not merge.
```

For larger work in WSL/tmux:

```text
$autopilot implement issue #N with PRD/docs context. Run review and QA gates. Do not merge.
```

Branch naming:

```text
feat/short-feature-name
fix/short-bug-name
docs/short-doc-name
chore/short-maintenance-name
```

Stop condition:

- change is implemented
- tests/checks have run or validation gaps are clearly stated
- docs are updated if needed

### 6. Review

Review before merge, not after.

Preferred OMX surface:

```text
$code-review
```

Review should check:

- correctness
- security
- maintainability
- tests
- docs
- scope match
- user-facing behavior
- architecture fit

Review outcomes:

- `APPROVE`
- `COMMENT`
- `REQUEST CHANGES`

For community PRs, the agent should explain the PR in non-developer terms before recommending an action.

Stop condition:

- no blocking review findings remain
- owner understands the change
- owner approves merge

### 7. QA

Use after review, especially for user-facing changes.

Preferred OMX surface:

```text
$ultraqa
```

QA should check:

- acceptance criteria
- edge cases
- smoke test
- UI behavior if relevant
- accessibility if relevant
- failure modes
- docs accuracy

Stop condition:

- QA passes
- or issues are fixed and QA reruns
- or remaining risk is explicitly accepted by owner

### 8. PR and Merge

Open PRs for reviewable chunks.

Useful commands:

```bash
git status
git diff
git add .
git commit -m "Short clear message"
gh pr create
gh pr view
gh pr checks
```

Merge only after owner approval.

Do not auto-merge community PRs early in the project.

### 9. Document

After meaningful changes, update:

- README
- docs
- roadmap
- contributor tasks
- changelog or release notes

The documentation should help:

- future owner sessions
- fresh agents
- GitHub contributors
- non-developer readers

### 10. Checkpoint Memory

Do not write memory automatically.

First produce memory candidates:

```text
Review the latest work and propose project-memory updates.
Separate stable facts, owner preferences, temporary notes, and things that should stay out of memory.
Do not write project-memory.json yet.
```

Good memory:

- project mission
- stable commands
- architecture decisions
- contribution rules
- approval gates
- release process

Bad memory:

- raw transcripts
- secrets
- temporary bugs
- full PR dumps
- private notes

## GitHub Community Workflow

For a public project, create these files early:

```text
README.md
LICENSE
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
.github/PULL_REQUEST_TEMPLATE.md
.github/ISSUE_TEMPLATE/bug_report.md
.github/ISSUE_TEMPLATE/feature_request.md
.github/ISSUE_TEMPLATE/good_first_issue.md
```

Recommended early rules:

- no automatic merges
- CI must pass before merge
- PRs should link to an issue
- large changes need discussion first
- keep good-first issues small
- be welcoming but strict about scope
- owner has final say on product direction

## License Note

MIT is a common permissive license.

You do not obtain it. You choose it by adding the MIT license text to a `LICENSE` file.

MIT usually means:

- people can use, copy, modify, distribute, and sell the code
- they must keep the license/copyright notice
- the software has no warranty

Ask for a license comparison before choosing MIT if the project has business, privacy, data, model, or commercial sensitivity.

## Approval Gates

Always ask before:

- publishing a repository
- making a private project public
- choosing or changing a license
- pushing to GitHub for the first time
- merging a PR
- deleting branches or history
- removing files that may be user-created
- storing active project memory
- adding paid services or external accounts
- exposing session history or private prompts

Proceed without asking for:

- local read-only inspection
- drafting docs
- creating local planning files
- formatting local docs
- running safe local verification
- making reversible local edits already requested by owner

## Starter Prompts

### Start a new project

```text
Use docs/WORKFLOW.md as the operating guide.
I am not a developer. I want to turn an idea into an open-source GitHub project.
Start with clarification only. Do not write code or publish anything yet.
```

### Create the PRD

```text
Using the clarified idea brief, create a founder-friendly PRD and architecture plan.
Mark assumptions and open questions.
Do not implement yet.
```

### Implement one issue

```text
Implement issue #N using docs/WORKFLOW.md.
Keep scope small.
Run verification.
Do not merge.
```

### Review a PR

```text
Review this PR for a non-developer owner.
Explain what changed, why it matters, risks, tests, and whether to approve, comment, or request changes.
Do not merge.
```

### Prepare memory candidates

```text
Prepare project-memory candidates from the latest completed work.
Do not write memory yet.
Separate stable facts from temporary notes.
```

## Future Skill

After this workflow is used for a real project, turn it into a personal skill.

Possible name:

```text
open-source-ralph-loop
```

Skill purpose:

```text
Guide a non-developer founder from idea clarification to PRD, GitHub-ready repo setup, issue decomposition, implementation branches, PR review, QA, and controlled memory updates.
```

The skill should enforce:

- interview before PRD
- PRD before implementation
- review before merge
- QA before release
- explicit approval before publishing
- explicit approval before memory writes
- no automatic merge of community PRs

