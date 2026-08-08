/* App management enhancements: delete apps and keep management reversible inside sort sessions. */

function requestAppDelete(categoryId, appId) {
  const category = getCategory(categoryId);
  const app = category?.apps.find(candidate => candidate.id === appId);
  if (!category || !app) return;

  confirmTitle.textContent = `刪除「${app.name}」？`;
  confirmDescription.textContent = "刪除後會從這個分類移除。若你正在調整 App 順序，仍可用下方的「取消」復原。";
  confirmSubmit.textContent = "刪除";
  confirmAction = () => {
    const currentCategory = getCategory(categoryId);
    if (!currentCategory) return;
    currentCategory.apps = currentCategory.apps.filter(candidate => candidate.id !== appId);

    /* Outside a management/sort session, deletion should persist immediately. */
    if (!sortSession || sortSession.mode !== "app" || sortSession.categoryId !== categoryId) {
      persistState();
    }

    render();
    showToast(`${app.name} 已移除`);
  };
  confirmDialog.showModal();
}

createAppItem = function createManagedAppItem(category, app) {
  const item = document.createElement("div");
  item.className = "app-item";
  item.dataset.appId = app.id;

  const main = document.createElement("button");
  main.type = "button";
  main.className = "app-main";
  main.title = app.name;

  const circle = document.createElement("span");
  circle.className = "app-circle";

  const initial = document.createElement("span");
  initial.className = "app-initial";
  initial.textContent = app.name.trim().slice(0, 1).toUpperCase() || "•";
  circle.appendChild(initial);

  if (app.icon) {
    const icon = document.createElement("img");
    icon.className = "app-favicon";
    icon.src = app.icon;
    icon.alt = "";
    icon.loading = "lazy";
    icon.addEventListener("load", () => {
      initial.hidden = true;
    });
    icon.addEventListener("error", () => {
      icon.remove();
      initial.hidden = false;
    });
    circle.appendChild(icon);
  }

  const label = document.createElement("span");
  label.className = "app-label";
  label.textContent = app.name;

  main.append(circle, label);
  main.addEventListener("click", () => {
    if (sortSession?.mode === "app" && sortSession.categoryId === category.id) return;
    window.open(app.url, "_blank", "noopener,noreferrer");
  });

  /* Desktop users can also right-click an app to delete it. */
  main.addEventListener("contextmenu", event => {
    event.preventDefault();
    requestAppDelete(category.id, app.id);
  });

  const controls = document.createElement("div");
  controls.className = "sort-controls app-manage-controls";
  const index = category.apps.findIndex(candidate => candidate.id === app.id);

  const removeButton = smallMoveButton("×", "刪除 App", () => requestAppDelete(category.id, app.id));
  removeButton.classList.add("app-delete-button");

  controls.append(
    smallMoveButton("←", "往左移", () => moveApp(category.id, app.id, -1), index === 0),
    smallMoveButton("→", "往右移", () => moveApp(category.id, app.id, 1), index === category.apps.length - 1),
    removeButton
  );

  item.append(main, controls);
  return item;
};

/* app.js renders once before this enhancement file loads, so refresh the view with the managed item renderer. */
render();
