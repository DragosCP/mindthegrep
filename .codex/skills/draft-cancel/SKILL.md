---
name: draft-cancel
description: Cancel an isolated DraftKit draft session, discard draft-session edits, restore the live baseline, clear runtime state, and stop only verified DraftKit-owned preview processes.
---

# Draft Cancel

Cancel the draft and restore live.

## Command

```bash
node ./scripts/draftkit-session.mjs cancel
```

Use the direct Node command for Codex Desktop, WSL, and Linux sessions. Do not route this button through npm DraftKit aliases from a WSL UNC workspace.

## Rules

- Restore the pre-draft live baseline by discarding or reverting draft-session edits.
- Do not revert unrelated user work that existed before `draft-open`.
- If DraftKit cannot safely separate draft edits from pre-existing changes, block with a clear recovery path instead of claiming the draft was discarded.
- Preserve approved snapshots. Preserve cancelled draft artifacts only as evidence when they do not keep the cancelled draft active in the app.
- Mark the session cancelled and remove `.draftspec/state/draftkit-active.json`.
- Append a local history event under `.draftspec/logs/`.
- Stop a process only when recorded state proves DraftKit started it and the current process identity still matches.
- Never kill a process based on PID alone.
- Current MVP limitation: `node ./scripts/draftkit-session.mjs cancel` may only clear runtime state. If source files remain changed after cancel, report that as incomplete cancellation.

## Output

- Live mode status and restored baseline evidence.
- Whether draft-session edits were discarded or why cancellation blocked.
- Preserved evidence or approved artifacts.
- Whether a DraftKit-owned preview process was stopped.
- Next normal action.
