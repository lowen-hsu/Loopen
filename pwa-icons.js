/* Enhances Loopen with server-side PWA manifest discovery for newly added apps. */

const ICON_META_VERSION = 2;

async function fetchAppMetadata(url) {
  try {
    const response = await fetch(`/api/app-meta?v=${ICON_META_VERSION}&url=${encodeURIComponent(url)}`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("Loopen PWA icon lookup unavailable; using favicon fallback.", error);
    return null;
  }
}

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

  const metadata = await fetchAppMetadata(normalizedUrl);

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
      iconSource: metadata?.iconSource || "favicon-fallback",
      iconPurpose: metadata?.iconPurpose || null,
      iconSizes: metadata?.iconSizes || null,
      iconMetaVersion: ICON_META_VERSION
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
