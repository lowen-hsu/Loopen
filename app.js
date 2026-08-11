const STORAGE_KEY = "loopen:v1";

const defaultState = {
  version: 1,
  categories: [
    {
      id: "work",
      name: "工作",
      apps: [
        { id: "canva", name: "Canva", url: "https://www.canva.com/", icon: "https://www.canva.com/favicon.ico" },
        { id: "gmail", name: "Gmail", url: "https://mail.google.com/", icon: "https://mail.google.com/favicon.ico" },
        { id: "odoo", name: "Odoo", url: "https://www.odoo.com/", icon: "https://www.odoo.com/favicon.ico" }
      ]
    },
    {
      id: "store",
      name: "店務",
      apps: []
    },
    {
      id: "ai",
      name: "AI 工具",
      apps: [
        { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/", icon: "https://chatgpt.com/favicon.ico" },
        { id: "claude", name: "Claude", url: "https://claude.ai/", icon: "https://claude.ai/favicon.ico" }
      ]
    }
  ]
};

const categoryList = document.getElementById("categoryList");
const searchInput = document.getElementById("searchInput");
const addCategoryButton = document.getElementById("addCategoryButton");
const settingsButton = document.getElementById("settingsButton");
const settingsMenu = document.getElementById("settingsMenu");

const formDialog = document.getElementById("formDialog");
const dialogForm = document.getElementById("dialogForm");
const dialogTitle = document.getElementById("dialogTitle");
const dialogDescription = document.getElementById("dialogDescription");
const dialogFields = document.getElementById("dialogFields");
const dialogClose = document.getElementById("dialogClose");
const dialogCancel = document.getElementById("dialogCancel");

const confirmDialog = document.getElementById("confirmDialog");
const confirmTitle = document.getElementById("confirmTitle");
const confirmDescription = document.getElementById("confirmDescription");
const confirmCancel = document.getElementById("confirmCancel");
const confirmSubmit = document.getElementById("confirmSubmit");

const toast = document.getElementById("toast");
const toastText = document.getElementById("toastText");

let state = loadState();
let query = "";
let formContext = null;
let confirmAction = null;
let sortSession = null;
let toastTimer = null;

setGreeting();
render();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uid(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed?.version === 1 && Array.isArray(parsed.categories)) return parsed;
  } catch (error) {
    console.warn("Loopen storage could not be read.", error);
  }
  const initial = clone(defaultState);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setGreeting() {
  const hour = new Date().getHours();
  document.getElementById("greeting").textContent = hour < 12 ? "早安" : hour < 18 ? "下午好" : "晚上好";
}

function showToast(message) {
  toastText.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2200);
}

function getCategory(categoryId) {
  return state.categories.find(category => category.id === categoryId);
}

function getCategoryIndex(categoryId) {
  return state.categories.findIndex(category => category.id === categoryId);
}

function render() {
  categoryList.replaceChildren();
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-Hant");
  let visibleCount = 0;

  state.categories.forEach((category, categoryIndex) => {
    const categoryMatches = normalizedQuery && category.name.toLocaleLowerCase("zh-Hant").includes(normalizedQuery);
    const matchingApps = normalizedQuery
      ? category.apps.filter(app => app.name.toLocaleLowerCase("zh-Hant").includes(normalizedQuery))
      : category.apps;

    if (normalizedQuery && !categoryMatches && matchingApps.length === 0) return;

    visibleCount += 1;
    categoryList.appendChild(createCategory(category, categoryIndex, categoryMatches ? category.apps : matchingApps));
  });

  if (normalizedQuery && visibleCount === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-search";
    empty.textContent = "找不到符合的 App，換個關鍵字試試看。";
    categoryList.appendChild(empty);
  }
}

function createCategory(category, categoryIndex, visibleApps) {
  const wrap = document.createElement("div");
  wrap.className = "category-wrap";
  wrap.dataset.categoryId = category.id;

  const card = document.createElement("section");
  card.className = "category-card";
  card.setAttribute("aria-labelledby", `category-title-${category.id}`);
  if (sortSession?.mode === "app" && sortSession.categoryId === category.id) card.classList.add("is-sorting");

  const head = document.createElement("div");
  head.className = "category-head";

  const title = document.createElement("h2");
  title.className = "category-title";
  title.id = `category-title-${category.id}`;
  title.textContent = category.name;

  const menuWrap = document.createElement("div");
  menuWrap.className = "settings-wrap category-settings-wrap";

  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "icon-button";
  menuButton.textContent = "•••";
  menuButton.setAttribute("aria-label", `${category.name} 分類設定`);
  menuButton.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "category-menu";
  menu.hidden = true;

  menu.append(
    menuAction("修改分類名稱", "✎", () => openCategoryRename(category.id)),
    menuAction("調整 App 順序", "↔", () => beginSort("app", category.id)),
    divider(),
    menuAction("分類往上", "↑", () => moveCategory(category.id, -1), categoryIndex === 0),
    menuAction("分類往下", "↓", () => moveCategory(category.id, 1), categoryIndex === state.categories.length - 1),
    divider(),
    menuAction("刪除分類", "×", () => requestCategoryDelete(category.id))
  );

  menuButton.addEventListener("click", event => {
    event.stopPropagation();
    closeAllMenus(menu);
    menu.hidden = !menu.hidden;
    menuButton.setAttribute("aria-expanded", String(!menu.hidden));
  });

  menuWrap.append(menuButton, menu);
  head.append(title, menuWrap);

  const grid = document.createElement("div");
  grid.className = "app-grid";

  visibleApps.forEach(app => {
    grid.appendChild(createAppItem(category, app));
  });

  if (!normalizedSearchActive() || category.name.toLocaleLowerCase("zh-Hant").includes(query.trim().toLocaleLowerCase("zh-Hant"))) {
    grid.appendChild(createAddAppItem(category.id));
  }

  card.append(head, grid);
  wrap.appendChild(card);

  if (sortSession?.categoryId === category.id) {
    wrap.appendChild(createSortBar(category));
  }

  return wrap;
}

function normalizedSearchActive() {
  return query.trim().length > 0;
}

function createAppItem(category, app) {
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

  const controls = document.createElement("div");
  controls.className = "sort-controls";
  const index = category.apps.findIndex(candidate => candidate.id === app.id);

  controls.append(
    smallMoveButton("←", "往左移", () => moveApp(category.id, app.id, -1), index === 0),
    smallMoveButton("→", "往右移", () => moveApp(category.id, app.id, 1), index === category.apps.length - 1)
  );

  item.append(main, controls);
  return item;
}

function createAddAppItem(categoryId) {
  const item = document.createElement("div");
  item.className = "app-item app-add";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "app-main";

  const circle = document.createElement("span");
  circle.className = "app-circle";
  circle.textContent = "＋";

  const label = document.createElement("span");
  label.className = "app-label";
  label.textContent = "新增";

  button.append(circle, label);
  button.addEventListener("click", () => openAddApp(categoryId));
  item.appendChild(button);
  return item;
}

function smallMoveButton(text, label, handler, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.disabled = disabled;
  button.addEventListener("click", event => {
    event.stopPropagation();
    if (!button.disabled) handler();
  });
  return button;
}

function menuAction(label, symbol, handler, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.disabled = disabled;

  const text = document.createElement("span");
  text.textContent = label;
  const icon = document.createElement("span");
  icon.textContent = symbol;
  button.append(text, icon);

  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    closeAllMenus();
    if (!button.disabled) handler();
  });
  return button;
}

function divider() {
  const element = document.createElement("div");
  element.className = "menu-divider";
  return element;
}

function closeAllMenus(except = null) {
  document.querySelectorAll(".category-menu, .popover").forEach(menu => {
    if (menu !== except) menu.hidden = true;
  });
  document.querySelectorAll('[aria-expanded="true"]').forEach(button => button.setAttribute("aria-expanded", "false"));
}

document.addEventListener("click", () => closeAllMenus());

function startSortSession(mode, categoryId, message) {
  if (!sortSession) {
    sortSession = {
      mode,
      categoryId,
      snapshot: clone(state),
      message: message || (mode === "app" ? `正在調整「${getCategory(categoryId).name}」App 順序` : "分類順序已變更")
    };
    return;
  }

  if (sortSession.mode !== mode || sortSession.categoryId !== categoryId) {
    state = clone(sortSession.snapshot);
    sortSession = {
      mode,
      categoryId,
      snapshot: clone(state),
      message: message || (mode === "app" ? `正在調整「${getCategory(categoryId).name}」App 順序` : "分類順序已變更")
    };
    return;
  }

  if (message) sortSession.message = message;
}

function beginSort(mode, categoryId, message) {
  startSortSession(mode, categoryId, message);
  render();
}

function moveCategory(categoryId, direction) {
  if (!sortSession || sortSession.mode !== "category" || sortSession.categoryId !== categoryId) {
    startSortSession("category", categoryId, "分類順序已變更");
  }

  const index = getCategoryIndex(categoryId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.categories.length) return;

  [state.categories[index], state.categories[target]] = [state.categories[target], state.categories[index]];
  render();
}

function moveApp(categoryId, appId, direction) {
  if (!sortSession || sortSession.mode !== "app" || sortSession.categoryId !== categoryId) {
    startSortSession("app", categoryId);
  }

  const category = getCategory(categoryId);
  if (!category) return;
  const index = category.apps.findIndex(app => app.id === appId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= category.apps.length) return;

  [category.apps[index], category.apps[target]] = [category.apps[target], category.apps[index]];
  render();
}

function createSortBar(category) {
  const bar = document.createElement("div");
  bar.className = "inline-sortbar";

  const message = document.createElement("p");
  message.textContent = sortSession?.message || `正在調整「${category.name}」順序`;

  const actions = document.createElement("div");
  actions.className = "sort-actions";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "sort-cancel";
  cancel.textContent = "取消";
  cancel.addEventListener("click", cancelSort);

  const save = document.createElement("button");
  save.type = "button";
  save.className = "sort-save";
  save.textContent = "儲存排序";
  save.addEventListener("click", saveSort);

  actions.append(cancel, save);
  bar.append(message, actions);
  return bar;
}

function saveSort() {
  if (!sortSession) return;
  persistState();
  sortSession = null;
  render();
  showToast("順序已儲存");
}

function cancelSort() {
  if (!sortSession) return;
  state = clone(sortSession.snapshot);
  sortSession = null;
  render();
  showToast("已取消排序變更");
}

function createField(labelText, id, { type = "text", placeholder = "", value = "", autocomplete = "off" } = {}) {
  const label = document.createElement("label");
  label.className = "field";
  label.setAttribute("for", id);
  label.append(document.createTextNode(labelText));

  const input = document.createElement("input");
  input.id = id;
  input.name = id;
  input.type = type;
  input.placeholder = placeholder;
  input.value = value;
  input.autocomplete = autocomplete;

  const error = document.createElement("span");
  error.className = "field-error";
  error.id = `${id}-error`;

  label.append(input, error);
  return { label, input, error };
}

function openAddApp(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return;

  formContext = { type: "add-app", categoryId };
  dialogTitle.textContent = "新增 Web App";
  dialogDescription.textContent = `加入到「${category.name}」`;
  dialogFields.replaceChildren();

  const urlField = createField("網址", "app-url", { type: "url", placeholder: "https://...", autocomplete: "url" });
  const nameField = createField("名稱", "app-name", { placeholder: "Web App 名稱" });
  dialogFields.append(urlField.label, nameField.label);

  let nameTouched = false;
  nameField.input.addEventListener("input", () => { nameTouched = nameField.input.value.trim().length > 0; });
  urlField.input.addEventListener("blur", () => {
    if (nameTouched || nameField.input.value.trim()) return;
    const suggestion = nameFromUrl(urlField.input.value);
    if (suggestion) nameField.input.value = suggestion;
  });

  openFormDialog(urlField.input);
}

function openAddCategory() {
  formContext = { type: "add-category" };
  dialogTitle.textContent = "新增分類";
  dialogDescription.textContent = "建立一個新的收藏區域";
  dialogFields.replaceChildren();

  const nameField = createField("分類名稱", "category-name", { placeholder: "例如：設計工具" });
  dialogFields.appendChild(nameField.label);
  openFormDialog(nameField.input);
}

function openCategoryRename(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return;

  formContext = { type: "rename-category", categoryId };
  dialogTitle.textContent = "修改分類名稱";
  dialogDescription.textContent = "讓名稱更符合你的使用方式";
  dialogFields.replaceChildren();

  const nameField = createField("分類名稱", "category-name", { value: category.name });
  dialogFields.appendChild(nameField.label);
  openFormDialog(nameField.input, true);
}

function openFormDialog(focusTarget, select = false) {
  formDialog.showModal();
  requestAnimationFrame(() => {
    focusTarget?.focus();
    if (select) focusTarget?.select();
  });
}

function closeFormDialog() {
  formDialog.close();
  formContext = null;
}

dialogClose.addEventListener("click", closeFormDialog);
dialogCancel.addEventListener("click", closeFormDialog);
addCategoryButton.addEventListener("click", openAddCategory);

dialogForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!formContext) return;

  if (formContext.type === "add-app") submitAddApp(formContext.categoryId);
  if (formContext.type === "add-category") submitAddCategory();
  if (formContext.type === "rename-category") submitCategoryRename(formContext.categoryId);
});

function submitAddApp(categoryId) {
  const category = getCategory(categoryId);
  const urlInput = document.getElementById("app-url");
  const nameInput = document.getElementById("app-name");
  clearFieldErrors();

  let normalizedUrl;
  try {
    normalizedUrl = normalizeUrl(urlInput.value);
  } catch {
    setFieldError("app-url", "請輸入有效的網址");
    urlInput.focus();
    return;
  }

  const name = nameInput.value.trim() || nameFromUrl(normalizedUrl);
  if (!name) {
    setFieldError("app-name", "請輸入 App 名稱");
    nameInput.focus();
    return;
  }

  const parsed = new URL(normalizedUrl);
  category.apps.push({
    id: uid("app"),
    name,
    url: normalizedUrl,
    icon: `${parsed.origin}/favicon.ico`
  });
  persistState();
  closeFormDialog();
  render();
  showToast(`${name} 已新增成功`);
}

function submitAddCategory() {
  const input = document.getElementById("category-name");
  const name = input.value.trim();
  clearFieldErrors();

  if (!name) {
    setFieldError("category-name", "請輸入分類名稱");
    input.focus();
    return;
  }

  if (state.categories.some(category => category.name.toLocaleLowerCase("zh-Hant") === name.toLocaleLowerCase("zh-Hant"))) {
    setFieldError("category-name", "已經有同名分類了");
    input.focus();
    return;
  }

  state.categories.push({ id: uid("category"), name, apps: [] });
  persistState();
  closeFormDialog();
  render();
  showToast(`「${name}」已新增成功`);
}

function submitCategoryRename(categoryId) {
  const input = document.getElementById("category-name");
  const category = getCategory(categoryId);
  const name = input.value.trim();
  clearFieldErrors();

  if (!name) {
    setFieldError("category-name", "請輸入分類名稱");
    input.focus();
    return;
  }

  if (state.categories.some(candidate => candidate.id !== categoryId && candidate.name.toLocaleLowerCase("zh-Hant") === name.toLocaleLowerCase("zh-Hant"))) {
    setFieldError("category-name", "已經有同名分類了");
    input.focus();
    return;
  }

  category.name = name;
  persistState();
  closeFormDialog();
  render();
  showToast("分類名稱已更新");
}

function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach(element => { element.textContent = ""; });
}

function setFieldError(id, message) {
  const error = document.getElementById(`${id}-error`);
  if (error) error.textContent = message;
}

function normalizeUrl(raw) {
  let value = raw.trim();
  if (!value) throw new Error("missing url");
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid protocol");
  return url.href;
}

function nameFromUrl(raw) {
  try {
    const normalized = normalizeUrl(raw);
    const host = new URL(normalized).hostname.replace(/^www\./, "");
    const first = host.split(".")[0].replace(/[-_]+/g, " ").trim();
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
  } catch {
    return "";
  }
}

function requestCategoryDelete(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return;
  confirmTitle.textContent = `刪除「${category.name}」？`;
  confirmDescription.textContent = category.apps.length
    ? `這個分類裡有 ${category.apps.length} 個 App，刪除後會一起移除。`
    : "刪除後這個分類會從首頁移除。";
  confirmSubmit.textContent = "刪除";
  confirmAction = () => {
    state.categories = state.categories.filter(candidate => candidate.id !== categoryId);
    if (sortSession?.categoryId === categoryId) sortSession = null;
    persistState();
    render();
    showToast("分類已刪除");
  };
  confirmDialog.showModal();
}

function requestReset() {
  confirmTitle.textContent = "重設 Loopen？";
  confirmDescription.textContent = "目前建立的分類與 App 會被範例資料取代。";
  confirmSubmit.textContent = "重設";
  confirmAction = () => {
    state = clone(defaultState);
    sortSession = null;
    query = "";
    searchInput.value = "";
    persistState();
    render();
    showToast("Loopen 已重設");
  };
  confirmDialog.showModal();
}

confirmCancel.addEventListener("click", () => {
  confirmDialog.close();
  confirmAction = null;
});
confirmSubmit.addEventListener("click", () => {
  const action = confirmAction;
  confirmDialog.close();
  confirmAction = null;
  action?.();
});

settingsButton.addEventListener("click", event => {
  event.stopPropagation();
  closeAllMenus(settingsMenu);
  settingsMenu.hidden = !settingsMenu.hidden;
  settingsButton.setAttribute("aria-expanded", String(!settingsMenu.hidden));
});
settingsMenu.querySelector('[data-setting-action="reset"]').addEventListener("click", event => {
  event.stopPropagation();
  settingsMenu.hidden = true;
  settingsButton.setAttribute("aria-expanded", "false");
  requestReset();
});

searchInput.addEventListener("input", event => {
  query = event.target.value;
  render();
});

window.addEventListener("keydown", event => {
  if (event.key === "Escape" && sortSession && !formDialog.open && !confirmDialog.open) cancelSort();
});