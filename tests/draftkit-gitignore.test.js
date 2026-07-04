import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("gitignore ignores DraftKit runtime state and logs but not product artifacts", () => {
  for (const path of [
    ".draftspec/state/draftkit-active.json",
    ".draftspec/state/sessions/session-1/draftkit-state.json",
    ".draftspec/logs/session-history.jsonl"
  ]) {
    const result = spawnSync("git", ["check-ignore", path], { encoding: "utf8" });
    assert.equal(result.status, 0, `${path} should be ignored`);
  }

  for (const path of [
    ".draftspec/features/bulk-tagging.json",
    ".draftspec/features/bulk-tagging.approved.json",
    ".draftspec/go-live/bulk-tagging.plan.md"
  ]) {
    const result = spawnSync("git", ["check-ignore", path], { encoding: "utf8" });
    assert.notEqual(result.status, 0, `${path} should not be ignored`);
  }
});
