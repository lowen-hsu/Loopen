/* Enhances the existing add-app flow with server-side PWA manifest discovery. */

submitAddApp = async function submitAddAppWithPwaIcon(categoryId) {
  const category = getCategory(categoryId);
  const urlInput = document.getElementById("app-url");
  const nameInput = document.getElementById("app-name");
  const submitButton = document.getElementById("dialogSubmit");
  clearFieldErrors();

  let normalizedUrl;
  try {
    normalizedUrl = normalizeUrl(urlInput.value);
  } catch {
    setFieldError("app-url", "請輸入有效的網址");
    urlInput.focus();
    return;
  }

  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "讀取圖示…";

  let metadata = null;
  try {
    const response = await fetch(`/api/app-meta?url=${encodeURIComponent(normalizedUrl)}`, {
      headers: { Accept: "application/json" }
    });
    if (response.ok) metadata = await response.json();
  } catch (error) {
    console.warn("Loopen PWA icon lookup unavailable; using favicon fallback.", error);
  }

  try {
    const name = nameInput.value.trim() || metadata?.name || nameFromUrl(normalizedUrl);
    if (!name) {
      setFieldError("app-name", "請輸入 App 名稱");
      nameInput.focus();
      return;
    }

    const parsed = new URL(normalizedUrl);
    const icon = metadata?.icon || `${parsed.origin}/favicon.ico`;

    category.apps.push({
      id: uid("app"),
      name,
      url: normalizedUrl,
      icon,
      iconSource: metadata?.iconSource || "favicon-fallback"
    });

    persistState();
    closeFormDialog();
    render();
    showToast(metadata?.iconSource === "manifest" ? `${name} 已新增，並取得 PWA 圖示` : `${name} 已新增成功`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
};
