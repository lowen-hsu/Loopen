/* Resolves Loopen App icons from page metadata while preserving browser favicon identity. */

const ICON_META_VERSION = 5;
const iconRepairInFlight = new Set();

async function fetchAppMetadata(url) {
  try {
    const response = await fetch(`/api/app-meta?v=${ICON_META_VERSION}&url=${encodeURIComponent(url)}`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("Loopen icon lookup unavailable; using stored icon.", error);
    return null;
  }
}

submitAddApp = async function submitAddAppWithResolvedIcon(categoryId) {
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
    showToast(`${name} 已新增成功`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
};

/*
 * Existing stored icons from older resolver versions are migrated once so a
 * manifest icon previously chosen over the browser favicon can be corrected.
 * After migration, valid explicit page favicons are preserved even when small.
 */
async function repairAppIconIfNeeded(categoryId, appId, imageElement) {
  const category = getCategory(categoryId);
  const app = category?.apps.find(candidate => candidate.id === appId);
  if (!app?.url || !app.icon || !imageElement?.naturalWidth || !imageElement?.naturalHeight) return;

  const ratio = imageElement.naturalWidth / imageElement.naturalHeight;
  const weirdAspect = ratio < 0.8 || ratio > 1.25;
  const staleResolver = Number(app.iconMetaVersion || 0) < ICON_META_VERSION;
  const weakFallback = !app.iconSource || app.iconSource === "favicon-fallback";

  if (!staleResolver && !weirdAspect && !weakFallback) return;
  if (iconRepairInFlight.has(app.id)) return;

  iconRepairInFlight.add(app.id);
  try {
    const metadata = await fetchAppMetadata(app.url);

    /* First choice is always the resolver's canonical browser-like favicon. */
    if (metadata?.icon) {
      const dimensions = await probeImage(metadata.icon);
      const ratioOk = dimensions && dimensions.width > 0 && dimensions.height > 0 &&
        dimensions.width / dimensions.height >= 0.8 &&
        dimensions.width / dimensions.height <= 1.25;

      if (ratioOk) {
        app.icon = metadata.icon;
        app.iconSource = metadata.iconSource || "icon";
        app.iconPurpose = metadata.iconPurpose || null;
        app.iconSizes = metadata.iconSizes || null;
        app.iconMetaVersion = ICON_META_VERSION;
        persistState();
        render();
        return;
      }
    }

    /* If the canonical favicon cannot load, use the next square candidate. */
    const candidates = Array.isArray(metadata?.iconCandidates) ? metadata.iconCandidates : [];
    for (const candidate of candidates) {
      if (!candidate?.icon || candidate.icon === app.icon) continue;
      const dimensions = await probeImage(candidate.icon);
      if (!dimensions) continue;
      const candidateRatio = dimensions.width / dimensions.height;
      if (candidateRatio < 0.8 || candidateRatio > 1.25) continue;

      app.icon = candidate.icon;
      app.iconSource = candidate.iconSource || "icon";
      app.iconPurpose = candidate.iconPurpose || null;
      app.iconSizes = candidate.iconSizes || null;
      app.iconMetaVersion = ICON_META_VERSION;
      persistState();
      render();
      return;
    }

    app.iconMetaVersion = ICON_META_VERSION;
    persistState();
  } catch (error) {
    console.warn("Loopen icon repair failed.", error);
  } finally {
    iconRepairInFlight.delete(app.id);
  }
}

function probeImage(url) {
  return new Promise(resolve => {
    const probe = new Image();
    const timer = setTimeout(() => resolve(null), 4500);
    probe.onload = () => {
      clearTimeout(timer);
      resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    };
    probe.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    probe.src = url;
  });
}
