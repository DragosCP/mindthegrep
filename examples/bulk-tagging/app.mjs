import { createBulkTagFakeBackend, createBulkTaggingDraftFlow } from "../../src/draftkit/index.js";

const backend = createBulkTagFakeBackend();
const flow = await createBulkTaggingDraftFlow({ backend });

const itemsEl = document.querySelector("#items");
const statusEl = document.querySelector("#status");
const selectAllButton = document.querySelector("#select-all");
const bulkTagButton = document.querySelector("#bulk-tag");
const dialog = document.querySelector("#tag-dialog");
const tagSelect = document.querySelector("#tag-select");
const simulateFailure = document.querySelector("#simulate-failure");
const applyTag = document.querySelector("#apply-tag");

for (const tag of flow.tags) {
  const option = document.createElement("option");
  option.value = tag.id;
  option.textContent = tag.label;
  tagSelect.append(option);
}

render();

selectAllButton.addEventListener("click", () => {
  flow.selectItems(flow.items.map((item) => item.id));
  render();
});

bulkTagButton.addEventListener("click", () => {
  flow.openTagDialog();
  render();
  dialog.showModal();
});

applyTag.addEventListener("click", async (event) => {
  event.preventDefault();
  await flow.applyTag(tagSelect.value, { simulateFailure: simulateFailure.checked });
  dialog.close();
  render();
});

function render() {
  bulkTagButton.disabled = flow.selectedIds.length === 0;
  statusEl.textContent = statusText();
  itemsEl.replaceChildren(...flow.items.map(renderItem));
}

function renderItem(item) {
  const row = document.createElement("label");
  row.className = "item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = flow.selectedIds.includes(item.id);
  checkbox.addEventListener("change", () => {
    const nextSelection = checkbox.checked
      ? [...flow.selectedIds, item.id]
      : flow.selectedIds.filter((id) => id !== item.id);
    flow.selectItems(nextSelection);
    render();
  });

  const title = document.createElement("span");
  title.textContent = item.title;

  const tags = document.createElement("span");
  tags.className = "tags";
  for (const tagId of item.tagIds) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = tagId;
    tags.append(tag);
  }

  row.append(checkbox, title, tags);
  return row;
}

function statusText() {
  if (flow.state === "idle") return "No items selected.";
  if (flow.state === "selected") return `${flow.selectedIds.length} items selected.`;
  if (flow.state === "dialog_open") return "Choose a tag to apply.";
  if (flow.state === "saving") return "Saving optimistic update.";
  if (flow.state === "success") return "Tag applied. Select another set to continue.";
  if (flow.state === "rollback") return "Simulated failure: rollback complete. Select another set to continue.";
  return flow.state;
}
