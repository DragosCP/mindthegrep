import {
  addBackendContract,
  addFixture,
  addState,
  addUiLocation,
  createSpecGraph,
  recordAction
} from "./spec-graph.js";

export function createBulkTaggingSpec() {
  const graph = createSpecGraph({
    feature: "bulk-tagging",
    title: "Bulk Tagging",
    description: "Select multiple items, tag them optimistically, and roll back on failure."
  });

  for (const location of [
    { id: "items-route", location: "routes.items", type: "route", label: "Items" },
    { id: "bulk-tag-button", location: "items.toolbar.bulkActions", type: "button", label: "Tag selected" },
    { id: "bulk-tag-dialog", location: "items.dialogs.bulkTag", type: "dialog", label: "Apply tag" },
    { id: "failure-toggle", location: "items.dialogs.bulkTag.footer", type: "checkbox", label: "Simulate failure" }
  ]) {
    addUiLocation(graph, location);
  }

  for (const state of [
    { id: "idle", label: "No items selected" },
    { id: "selected", label: "Items selected" },
    { id: "dialog_open", label: "Bulk tagging dialog open" },
    { id: "saving", label: "Optimistic update pending" },
    { id: "success", label: "Tag applied" },
    { id: "rollback", label: "Optimistic update rolled back" }
  ]) {
    addState(graph, state);
  }

  for (const fixture of [
    { id: "items.20", kind: "items", count: 20 },
    { id: "tags.default", kind: "tags", values: ["priority", "review", "archive"] }
  ]) {
    addFixture(graph, fixture);
  }

  addBackendContract(graph, {
    id: "bulkApplyTags",
    operation: "bulkApplyTags",
    method: "POST",
    pathHint: "/items/bulk-tags",
    requestShape: { itemIds: "string[]", tagId: "string" },
    responseShape: { updatedIds: "string[]", tagId: "string" },
    failureModes: ["validation_error", "partial_failure", "network_failure"]
  });

  return graph;
}

export async function createBulkTaggingDraftFlow({ backend, graph = createBulkTaggingSpec() }) {
  let items = await backend.listItems();
  const tags = await backend.listTags();
  let selectedIds = [];
  let state = "idle";
  let lastSnapshot = null;

  return {
    graph,

    get state() {
      return state;
    },

    get selectedIds() {
      return [...selectedIds];
    },

    get items() {
      return items.map(copyItem);
    },

    get tags() {
      return tags.map((tag) => ({ ...tag }));
    },

    selectItems(ids) {
      selectedIds = [...new Set(ids)];
      const nextState = selectedIds.length > 0 ? "selected" : "idle";
      recordAction(graph, {
        id: selectedIds.length > 0 ? "select-items" : "clear-selection",
        from: "*",
        event: selectedIds.length > 0 ? "select.items" : "selection.clear",
        to: nextState,
        ui: "items-route",
        payload: { selectedCount: selectedIds.length }
      });
      state = nextState;
      return snapshot();
    },

    openTagDialog() {
      requireState(state, "selected", "Select items before opening the tag dialog");
      recordAction(graph, {
        id: "open-bulk-tag-dialog",
        from: state,
        event: "click.bulk-tag-button",
        to: "dialog_open",
        ui: "bulk-tag-button"
      });
      state = "dialog_open";
      return snapshot();
    },

    async applyTag(tagId, { simulateFailure = false } = {}) {
      requireState(state, "dialog_open", "Open the tag dialog before applying a tag");

      lastSnapshot = items.map(copyItem);
      items = applyTagLocally(items, selectedIds, tagId);
      recordAction(graph, {
        id: "apply-tag-optimistic",
        from: "dialog_open",
        event: "submit.bulk-tag-dialog",
        to: "saving",
        ui: "bulk-tag-dialog",
        backendContract: "bulkApplyTags",
        optimistic: true,
        payload: { itemIds: "selectedIds", tagId }
      });
      state = "saving";

      if (simulateFailure) backend.failNextBulkApply();

      try {
        await backend.bulkApplyTags({ itemIds: selectedIds, tagId });
        recordAction(graph, {
          id: "bulk-tag-success",
          from: "saving",
          event: "backend.bulkApplyTags.success",
          to: "success",
          backendContract: "bulkApplyTags"
        });
        selectedIds = [];
        state = "success";
      } catch (error) {
        items = lastSnapshot.map(copyItem);
        recordAction(graph, {
          id: "bulk-tag-rollback",
          from: "saving",
          event: "backend.bulkApplyTags.failure",
          to: "rollback",
          backendContract: "bulkApplyTags",
          rollback: true,
          errorCode: error.code || "UNKNOWN"
        });
        selectedIds = [];
        state = "rollback";
      }

      return snapshot();
    },

    reset() {
      selectedIds = [];
      state = "idle";
      return snapshot();
    }
  };

  function snapshot() {
    return {
      state,
      selectedIds: [...selectedIds],
      items: items.map(copyItem),
      tags: tags.map((tag) => ({ ...tag }))
    };
  }
}

function applyTagLocally(items, selectedIds, tagId) {
  const idSet = new Set(selectedIds);
  return items.map((item) => {
    if (!idSet.has(item.id)) return item;
    return { ...item, tagIds: [...new Set([...item.tagIds, tagId])] };
  });
}

function requireState(actual, expected, message) {
  if (actual !== expected) throw new Error(message);
}

function copyItem(item) {
  return { ...item, tagIds: [...item.tagIds] };
}
