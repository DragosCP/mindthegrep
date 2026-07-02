# Open Source Project Pipeline

Created: 2026-07-02

Purpose: give a non-developer founder a repeatable Codex/OMX workflow for turning an idea into an open GitHub project that other people can understand, trust, contribute to, and review.

This is a starter operating manual, not active OMX memory. Promote parts into `project-memory.json`, `AGENTS.md`, or a custom skill only after the workflow has been used once or twice.

## Big Picture

The goal is not to automate judgment away. The goal is to automate the repetitive project machinery so the owner can make the important product decisions:

- What problem are we solving?
- Who is it for?
- What is in the MVP?
- What is intentionally not included yet?
- What quality bar must contributions meet?
- What gets merged, delayed, or rejected?

Codex and OMX can help draft, implement, test, review, document, and maintain the workflow around those decisions.

## Recommended Working Surfaces

Use these surfaces deliberately:

| Surface | Best For | Notes |
| --- | --- | --- |
| Codex App on Windows | Conversation, docs, normal project work, GitHub review, visual inspection | Comfortable UI, but WSL-agent mode was unstable in this setup. |
| Codex CLI in WSL | Serious OMX work, tmux/team workflows, Linux-native dev tooling | Preferred home for full OMX. Use `/home/drago/mindthegrep` style paths. |
| GitHub web UI | Repository settings, final review of public-facing pages, community moderation | Owner should check public-facing changes before publishing. |
| GitHub CLI `gh` | Creating repos, issues, PRs, labels, milestones | Installed and authenticated locally. |

Current caution: OMX team/HUD/question runtime surfaces need an attached tmux OMX CLI shell. In Codex App outside tmux, use normal Codex tools and app-safe commands, or switch to WSL CLI when full team orchestration is needed.

## Plain-English GitHub Concepts

| Term | Meaning |
| --- | --- |
| Repository | The project folder on GitHub. It holds code, docs, issues, PRs, and project settings. |
| Commit | A saved snapshot of changes. A good commit explains one logical change. |
| Branch | A parallel line of work. Use branches so experiments do not break `main`. |
| Issue | A task, bug, feature request, question, or discussion item. |
| Pull Request, PR | A request to merge changes from one branch into another. It is where review happens. |
| CI | Automated checks, usually run by GitHub Actions. Tests, linting, builds, and security checks live here. |
| Release | A named version people can use or download. |
| License | The legal permission that tells others how they can use the project. |

## MIT License Basics

MIT is a permissive open-source license. You do not obtain it from anyone. You choose it by adding the standard MIT text to a `LICENSE` file and putting your copyright line in it.

MIT generally means:

- People can use, copy, modify, publish, distribute, sublicense, and sell the code.
- They must keep the copyright notice and license text.
- The software is provided without warranty.

MIT is common when you want community adoption and low friction. It is not the only option. If the project has legal/commercial sensitivity, ask for a license comparison before choosing.

## Owner Decisions vs Agent Automation

The owner should decide:

- Project name and public positioning.
- License choice.
- Core product goal and target users.
- MVP boundaries.
- Contribution policy and moderation tone.
- Which PRs get merged.
- Whether to publish releases or packages.
- Whether to accept breaking changes.

Codex/OMX can automate or assist:

- Clarifying the idea through interview.
- Drafting PRDs, architecture docs, roadmaps, and issue lists.
- Creating repo files and templates.
- Implementing scoped issues.
- Running tests and builds.
- Reviewing PRs and summarizing changes.
- Drafting responses to contributors.
- Preparing release notes.
- Maintaining project memory and onboarding docs.

## Pipeline Overview

Default path:

```text
Idea
-> Deep interview
-> PRD
-> Architecture and test plan
-> Repo/community setup
-> Issue decomposition
-> Implementation branches
-> Tests and verification
-> Code review
-> PR
-> Human approval
-> Merge
-> Release notes
-> Project memory update
```

OMX mapping:

| Phase | OMX/Codex Surface | Output |
| --- | --- | --- |
| Clarify idea | `$deep-interview` | Problem, audience, constraints, MVP boundaries |
| Plan product and architecture | `$plan` / `$ralplan` | PRD, architecture, acceptance criteria, test plan |
| Execute scoped work | `$autopilot`, `$pipeline`, or solo Codex | Implementation branch, commits, verification |
| Parallel work | `$team` from WSL/tmux | Multiple lanes for larger features |
| Review code | `$code-review` | Findings, approval/comment/request-changes |
| QA gate | `$ultraqa` | Adversarial QA report |
| Git operations | `git`, `gh`, `git-master` role | Branches, commits, PRs, issues |
| Documentation | `writer` role or normal Codex | README, docs, release notes |

## Phase 0: One-Time Machine Setup

Already mostly done on this machine:

- Git installed.
- GitHub CLI installed.
- GitHub CLI authenticated.
- Codex installed on Windows and WSL.
- OMX installed on Windows and WSL.
- Project-local OMX initialized in Windows and WSL copies of `mindthegrep`.

Useful checks:

```bash
git --version
gh auth status
codex --version
omx doctor
omx doctor --team
```

Do these from WSL for the full OMX setup:

```bash
cd ~/mindthegrep
omx doctor
omx doctor --team
```

## Phase 1: Idea Intake

Goal: turn a fuzzy idea into a clear mission without overbuilding.

Use this prompt:

```text
$deep-interview
I am not a developer. I want to turn this idea into an open-source GitHub project that other people can contribute to.

Interview me to clarify:
- the problem
- target users
- core workflow
- MVP scope
- non-goals
- risks
- what contributors should be able to help with
- what must stay under my approval

Do not write code yet. Produce a founder-friendly brief and open questions.
```

Owner approval gate:

- Do I understand the project in one sentence?
- Do I know who it is for?
- Do I know what the MVP includes?
- Do I know what is out of scope?
- Do I want this to be open source?

## Phase 2: PRD and Architecture

Goal: create durable docs that a fresh agent and a new contributor can read.

Use this prompt:

```text
$ralplan
Using the clarified idea brief, create an open-source MVP plan.

Produce:
- docs/PRD.md
- docs/ARCHITECTURE.md
- docs/ROADMAP.md
- docs/ACCEPTANCE_CRITERIA.md
- docs/CONTRIBUTOR_TASKS.md

Include beginner-friendly explanations. Mark assumptions. Do not implement yet.
```

Required PRD sections:

- Problem
- Audience
- Goals
- Non-goals
- MVP features
- User journeys
- Data model, if any
- External services, if any
- Privacy and security notes
- Accessibility notes
- Acceptance criteria
- Risks
- Milestones

Owner approval gate:

- Does this reflect my idea?
- Is the MVP small enough?
- Are the non-goals honest?
- Are contributor tasks understandable?

## Phase 3: Repository Setup

Goal: create a GitHub-ready project skeleton.

Recommended files:

```text
README.md
LICENSE
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
docs/PRD.md
docs/ARCHITECTURE.md
docs/ROADMAP.md
docs/ACCEPTANCE_CRITERIA.md
docs/CONTRIBUTOR_TASKS.md
.github/ISSUE_TEMPLATE/bug_report.md
.github/ISSUE_TEMPLATE/feature_request.md
.github/ISSUE_TEMPLATE/good_first_issue.md
.github/PULL_REQUEST_TEMPLATE.md
.github/workflows/ci.yml
```

Use this prompt:

```text
Create the open-source repository skeleton for this project.

Assume MIT license unless I explicitly choose another license.
Create beginner-friendly GitHub community files:
- README
- LICENSE
- CONTRIBUTING
- CODE_OF_CONDUCT
- SECURITY
- issue templates
- PR template
- initial CI workflow

Do not publish to GitHub yet. Keep everything local and show me the files created.
```

Owner approval gate:

- Is the README understandable?
- Is the project name correct?
- Is the license choice correct?
- Is the contribution tone welcoming?
- Are issue templates clear?

## Phase 4: GitHub Publishing

Goal: publish only after the local repository skeleton is readable.

Possible commands:

```bash
git init
git add .
git commit -m "Initial open-source project skeleton"
gh repo create OWNER/REPO --public --source . --remote origin --push
```

Do not run `gh repo create --public` until the owner explicitly approves:

- repository name
- public visibility
- license
- first README
- whether any private notes or local artifacts must be excluded

Recommended `.gitignore` checks before publishing:

- `.omx/`
- `.codex/`
- `node_modules/`
- build outputs
- `.env`
- secrets
- local session archives

## Phase 5: Issue Decomposition

Goal: turn the PRD into contributor-friendly issues.

Use this prompt:

```text
Turn docs/PRD.md and docs/CONTRIBUTOR_TASKS.md into a GitHub issue plan.

Create:
- MVP milestone
- labels
- 5 to 10 good first issues
- implementation issues
- documentation issues
- testing issues

Do not create GitHub issues yet. Produce a preview first.
```

After approval, use `gh issue create` or let Codex run it.

Recommended labels:

```text
good first issue
help wanted
bug
feature
documentation
design
frontend
backend
testing
question
blocked
needs decision
```

Owner approval gate:

- Are the issues understandable to strangers?
- Are good-first issues genuinely small?
- Are labels simple?
- Are there tasks for non-code contributors?

## Phase 6: Implementation Loop

For each issue:

```text
Select one issue.
Create a branch.
Implement only that issue.
Run tests/build.
Update docs if needed.
Run code review and QA.
Open a PR.
```

Suggested branch names:

```text
feat/short-feature-name
fix/short-bug-name
docs/short-doc-name
chore/short-maintenance-name
```

Use this prompt:

```text
Implement issue #N.

Rules:
- Read AGENTS.md and relevant docs first.
- Keep scope limited to this issue.
- Create or use a feature branch.
- Add or update tests when meaningful.
- Run verification.
- Summarize changed files and evidence.
- Do not merge.
```

For bigger issues in WSL/tmux:

```text
$autopilot implement issue #N with PRD/docs context, then run code-review and ultraqa gates. Do not merge without owner approval.
```

## Phase 7: PR Review

Goal: make sure changes are understandable, tested, and safe before merging.

Use this prompt:

```text
$code-review
Review the current branch against the target branch.

Focus on:
- correctness
- security
- maintainability
- tests
- docs
- user-facing behavior
- whether the change matches the issue/PRD

Return APPROVE, COMMENT, or REQUEST CHANGES.
```

For community PRs:

```text
Summarize this PR for a non-developer owner.

Tell me:
- what changed
- why it matters
- whether tests passed
- risks
- what questions I should ask
- whether you recommend approve, comment, or request changes

Do not merge.
```

Owner approval gate:

- Do I understand what the PR changes?
- Did CI pass?
- Did Codex review it?
- Does it match the project direction?
- Is there any security, privacy, or licensing concern?

## Phase 8: Merge and Release

Merge only after owner approval.

Possible commands:

```bash
gh pr merge PR_NUMBER --squash --delete-branch
git checkout main
git pull
```

Release notes prompt:

```text
Draft release notes from merged PRs since the last release.
Use beginner-friendly language.
Group by features, fixes, docs, and internal changes.
Do not publish the release until I approve.
```

## Phase 9: Project Memory Updates

After meaningful decisions, create memory candidates first:

```text
Review the latest merged work and propose project-memory updates.

Separate:
- stable project facts
- owner preferences
- temporary implementation notes
- things that should stay out of memory

Do not write project-memory.json yet. Produce a preview.
```

Only promote short, stable facts into OMX memory.

Good memory candidates:

- project mission
- core architecture decisions
- test commands
- release process
- owner approval rules
- contribution policy

Bad memory candidates:

- full transcripts
- secrets
- temporary bugs
- large PR summaries
- raw issue dumps

## Suggested Starter GitHub Rules

Early project policy:

- No automatic merges.
- All community PRs require owner approval.
- CI must pass before merge.
- PRs must link to an issue or explain why not.
- Large changes need a design/PRD discussion first.
- Keep good-first issues small and well described.
- Be kind to contributors, but keep scope tight.

## Starter PR Template

```markdown
## Summary

What changed?

## Related Issue

Closes #

## Type of Change

- [ ] Feature
- [ ] Bug fix
- [ ] Documentation
- [ ] Test
- [ ] Refactor
- [ ] Chore

## Verification

- [ ] Tests pass
- [ ] Build passes
- [ ] I manually checked the affected flow

## Screenshots or Notes

Add screenshots, logs, or notes if useful.

## Checklist

- [ ] Scope matches the issue
- [ ] Docs updated if needed
- [ ] No secrets or private files included
- [ ] Ready for review
```

## Starter Issue Template

```markdown
## Goal

What should be improved or built?

## Why It Matters

Who benefits from this and why?

## Proposed Scope

What is included?

## Out of Scope

What should not be changed?

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Helpful Context

Links, screenshots, files, or notes.
```

## First Real Run

When ready to use this pipeline on the next project, start with:

```text
Use docs/OPEN_SOURCE_PROJECT_PIPELINE.md as the operating guide.
I am not a developer. Help me turn my idea into an open-source GitHub project.
Start with the Idea Intake phase. Ask only the questions needed to produce a founder-friendly brief.
Do not write code or publish anything yet.
```

## Future Skill Candidate

After this workflow has been used once, turn it into a skill such as `open-source-founder-pipeline`.

The skill should:

- Start with interview, not code.
- Produce PRD and community setup artifacts.
- Require explicit approval before public GitHub publishing.
- Use GitHub CLI only after previewing commands.
- Run code-review and QA gates before PR recommendations.
- Never merge community PRs without owner approval.
- Keep all explanations beginner-friendly.

