export function createBulkTagFakeBackend({ items = defaultItems(), tags = defaultTags() } = {}) {
  let currentItems = items.map(copyItem);
  let failNextBulkApply = false;

  return {
    async listItems() {
      return currentItems.map(copyItem);
    },

    async listTags() {
      return tags.map((tag) => ({ ...tag }));
    },

    failNextBulkApply() {
      failNextBulkApply = true;
    },

    async bulkApplyTags({ itemIds, tagId }) {
      if (failNextBulkApply) {
        failNextBulkApply = false;
        const error = new Error("Simulated bulk tag failure");
        error.code = "SIMULATED_FAILURE";
        throw error;
      }

      const idSet = new Set(itemIds);
      currentItems = currentItems.map((item) => {
        if (!idSet.has(item.id)) return item;
        return { ...item, tagIds: unique([...item.tagIds, tagId]) };
      });

      return {
        updatedIds: [...idSet],
        tagId,
        items: currentItems.filter((item) => idSet.has(item.id)).map(copyItem)
      };
    }
  };
}

export function defaultItems(count = 20) {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${String(index + 1).padStart(2, "0")}`,
    title: `Customer insight ${index + 1}`,
    tagIds: index % 5 === 0 ? ["review"] : []
  }));
}

export function defaultTags() {
  return [
    { id: "priority", label: "Priority" },
    { id: "review", label: "Review" },
    { id: "archive", label: "Archive" }
  ];
}

function unique(values) {
  return [...new Set(values)];
}

function copyItem(item) {
  return { ...item, tagIds: [...item.tagIds] };
}
