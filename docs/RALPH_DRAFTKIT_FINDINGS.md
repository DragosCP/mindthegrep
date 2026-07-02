# Ralph And DraftKit Findings

Date: 2026-07-02

## Question

Does DraftKit interfere with Ralph-style automation, or can it make Ralph safer and more useful?

## Short Answer

DraftKit should not ask Ralph to build a whole uncertain feature end to end. That defeats DraftKit's purpose.

DraftKit should instead give Ralph smaller, phase-bounded PRDs:

```text
Ralph PRD 1: draft workflow only
Ralph PRD 2: revise draft only
Ralph PRD 3: integrate approved snapshot
```

That turns DraftKit into a Ralph-compatible UX/workflow validation harness rather than a competing automation loop.

## Evidence

Public Ralph guidance emphasizes clear scope, explicit stop conditions, progress files, feedback loops, and smaller steps. It describes HITL and AFK modes, max iteration caps, progress tracking, structured PRD items, and the risk of vague tasks causing shortcuts or endless loops.

Sources:

- AI Hero, "11 Tips For AI Coding With Ralph Wiggum": `https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum`
- Anthropic, "Effective harnesses for long-running agents": `https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents`
- OMX upstream Ralph skill: `https://raw.githubusercontent.com/Yeachan-Heo/oh-my-codex/main/skills/ralph/SKILL.md`
- OMX upstream Autopilot skill: `https://raw.githubusercontent.com/Yeachan-Heo/oh-my-codex/main/skills/autopilot/SKILL.md`
- OMX issue 1607: `https://github.com/Yeachan-Heo/oh-my-codex/issues/1607`
- OMX issue 1555: `https://github.com/Yeachan-Heo/oh-my-codex/issues/1555`

## Local OMX Reading

The installed Ralph skill describes Ralph as a persistence loop with fresh verification evidence, architect verification, state persistence, optional PRD mode, and cleanup/regression gates.

The installed Autopilot skill treats Ralph as an explicit alternate execution lane, while the default non-trivial loop is:

```text
deep-interview -> ralplan -> ultragoal -> code-review -> ultraqa
```

This matters because DraftKit should not force all users into Ralph. It should expose a clean contract that Ralph, Ultragoal, Team, Codex CLI, Claude Code CLI, and desktop surfaces can all consume.

## Product Implication

DraftKit should provide structured phase artifacts:

```text
draftkit ralph-prd <feature>
draftkit verify-draft <feature>
draftkit approve <feature>
draftkit backend-prd <approved-snapshot>
```

These commands do not need to exist immediately, but they name the product boundary:

- draft-only work has a separate acceptance contract from backend integration
- human workflow review is a real stop condition
- approved `.draftspec` snapshots become backend integration input
- protected-file checks prevent backend/database mutation during draft mode

## Ralph-Compatible PRD Shape

### Draft Workflow PRD

Goal:

- Build or revise a frontend-only workflow inside the current live app shell.

Must not:

- edit backend routes
- edit database files
- edit migrations
- edit real API contracts

Completion evidence:

- `.draftspec/features/<feature>.json` updated
- `npm run draftkit:validate` passes
- `npm run draftkit:protect:check` passes against a pre-draft snapshot
- browser/manual path is clickable
- agent stops for human feel review

### Draft Revision PRD

Goal:

- Adjust an existing draft workflow based on human feedback.

Completion evidence:

- same as draft workflow PRD
- previous draft history is preserved or superseded clearly
- no backend integration begins

### Live Integration PRD

Goal:

- Implement only the approved backend contracts from an approved `.draftspec` snapshot.

Must not:

- reinterpret loose prose as a new product spec
- create duplicate backend routes when existing boundaries can be extended
- change visible workflow behavior without reopening draft review

Completion evidence:

- approved `snapshotId` referenced
- backend/API tests pass
- live click-through matches the approved draft
- fake/local draft behavior is replaced by real persistence where required

## Open Product Questions

- Should DraftKit block live-mode work while an unapproved draft is open?
- Should DraftKit allow parallel drafts from the same live baseline?
- Should switching from draft to live require an explicit `approve`, `discard`, or `park` decision?
- Should the DraftKit UI overlay live inside the app, as a floating toolbar, or through an MCP/desktop side panel?
- Should DraftKit expose one vocabulary across Codex CLI, Codex Desktop, Claude Code CLI, and Claude Code Desktop?
