/* Stable delegated handlers for sort-related category actions.
   Loaded last so rerenders and enhancement scripts cannot detach these actions. */

(function installStableSortActions() {
  function resetToSnapshotIfSwitching(mode, categoryId) {
    if (!sortSession) return;
    if (sortSession.mode === mode && sortSession.categoryId === categoryId) return;
    state = clone(sortSession.snapshot);
    sortSession = null;
  }

  function beginManagedApps(categoryId) {
    const category = getCategory(categoryId);
    if (!category) return;

    resetToSnapshotIfSwitching("app", categoryId);
    if (!sortSession) {
      sortSession = {
        mode: "app",
        categoryId,
        snapshot: clone(state),
        message: `正在管理「${category.name}」App`
      };
    }

    closeAllMenus();
    render();
  }

  function moveCategoryStable(categoryId, direction) {
    resetToSnapshotIfSwitching("category", categoryId);
    if (!sortSession) {
      sortSession = {
        mode: "category",
        categoryId,
        snapshot: clone(state),
        message: "分類順序已變更"
      };
    }

    const index = getCategoryIndex(categoryId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.categories.length) return;

    [state.categories[index], state.categories[target]] = [state.categories[target], state.categories[index]];
    closeAllMenus();
    render();
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.(".category-menu button");
    if (!button || button.disabled) return;

    const wrap = button.closest(".category-wrap");
    const categoryId = wrap?.dataset.categoryId;
    if (!categoryId) return;

    const label = button.querySelector("span:first-child")?.textContent?.trim() || button.textContent.trim();

    if (label === "管理 App" || label === "調整 App 順序") {
      event.preventDefault();
      event.stopImmediatePropagation();
      beginManagedApps(categoryId);
      return;
    }

    if (label === "分類往上") {
      event.preventDefault();
      event.stopImmediatePropagation();
      moveCategoryStable(categoryId, -1);
      return;
    }

    if (label === "分類往下") {
      event.preventDefault();
      event.stopImmediatePropagation();
      moveCategoryStable(categoryId, 1);
    }
  }, true);
})();
