/* Enhances Loopen with server-side PWA manifest discovery for newly added apps. */

const ICON_META_VERSION = 4;
const iconRepairInFlight = new Set();

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

/*
 * Preserve normal stored icons. Re-check icons that are clearly unsuitable for
 * a launcher: odd aspect ratios, weak/unknown sources, or very small favicons.
 */
async function repairAppIconIfNeeded(categoryId, appId, imageElement) {
  const category = getCategory(categoryId);
  const app = category?.apps.find(candidate => candidate.id === appId);
  if (!app?.url || !app.icon || !imageElement?.naturalWidth || !imageElement?.naturalHeight) return;

  const ratio = imageElement.naturalWidth / imageElement.naturalHeight;
  const weirdAspect = ratio < 0.8 || ratio > 1.25;
  const lowResolution = Math.min(imageElement.naturalWidth, imageElement.naturalHeight) < 48;
  const weakSource = !app.iconSource || app.iconSource === "icon" || app.iconSource === "favicon-fallback";
  const weakSvg = /\.svg(?:\?|$)/i.test(app.icon) && app.iconSource !== "manifest";

  if (!weirdAspect && !lowResolution && !weakSource && !weakSvg) return;
  if (Number(app.iconMetaVersion || 0) >= ICON_META_VERSION && !weirdAspect && !lowResolution) return;
  if (iconRepairInFlight.has(app.id)) return;

  iconRepairInFlight.add(app.id);
  try {
    const metadata = await fetchAppMetadata(app.url);
    const candidates = Array.isArray(metadata?.iconCandidates) ? metadata.iconCandidates : [];
    if (metadata?.icon && !candidates.some(candidate => candidate.icon === metadata.icon)) {
      candidates.unshift({
        icon: metadata.icon,
        iconSource: metadata.iconSource,
        iconPurpose: metadata.iconPurpose,
        iconSizes: metadata.iconSizes
      });
    }

    for (const candidate of candidates) {
      if (!candidate?.icon || candidate.icon === app.icon) continue;
      const dimensions = await probeImage(candidate.icon);
      if (!dimensions) continue;
      const candidateRatio = dimensions.width / dimensions.height;
      if (candidateRatio < 0.88 || candidateRatio > 1.14) continue;
      if (Math.min(dimensions.width, dimensions.height) < 48) continue;

      app.icon = candidate.icon;
      app.iconSource = candidate.iconSource || "icon";
      app.iconPurpose = candidate.iconPurpose || null;
      app.iconSizes = candidate.iconSizes || null;
      app.iconMetaVersion = ICON_META_VERSION;
      persistState();
      render();
      return;
    }

    /* Mark the check complete so a weak-but-valid icon does not trigger on every render. */
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
