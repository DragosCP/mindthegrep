---
name: draft-cancel
description: Exit DraftKit draft mode, clear the active runtime mirror, append session history, preserve specs, and stop only verified DraftKit-owned preview processes.
---

# Draft Cancel

Exit draft mode without deleting draft work.

## Command

```bash
node ./scripts/draftkit-session.mjs cancel
```

Use the direct Node command for Codex Desktop, WSL, and Linux sessions. Do not route this button through npm DraftKit aliases from a WSL UNC workspace.

## Rules

- Preserve `.draftspec/features/<feature>.json` and approved snapshots.
- Mark the session cancelled and remove `.draftspec/state/draftkit-active.json`.
- Append a local history event under `.draftspec/logs/`.
- Stop a process only when recorded state proves DraftKit started it and the current process identity still matches.
- Never kill a process based on PID alone.

## Output

- Live mode status.
- Preserved product artifacts.
- Whether a DraftKit-owned preview process was stopped.
- Next normal action.
