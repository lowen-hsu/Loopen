/* Resolves Loopen App icons from page metadata while preserving browser favicon identity. */

const ICON_META_VERSION = 6;
const iconRepairInFlight = new Set();
const ICON_TARGET_SIZE = 32;

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

function parseSquareSizes(sizes) {
  const value = String(sizes || "").toLowerCase();
  const values = [];
  for (const match of value.matchAll(/(\d+)x(\d+)/g)) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width > 0 && width === height) values.push(width);
  }
  return values;
}

function browserFaviconRank(candidate) {
  if (!candidate?.icon || candidate.iconSource !== "icon") return -Infinity;

  const href = String(candidate.icon).toLowerCase();
  const sizes = String(candidate.iconSizes || "").toLowerCase();
  const squareSizes = parseSquareSizes(sizes);

  /* Loopen renders favicons at 25 CSS px. 32px is the best browser-style source. */
  if (squareSizes.includes(ICON_TARGET_SIZE)) return 1_000_000;

  /* A multi-resolution favicon.ico is a strong browser-native fallback. */
  if (sizes.includes("any") && href.includes("favicon.ico")) return 950_000;

  if (squareSizes.length) {
    const nearest = Math.min(...squareSizes.map(size => Math.abs(size - ICON_TARGET_SIZE)));
    return 900_000 - nearest * 1_000;
  }

  if (href.includes("favicon.ico")) return 850_000;
  return 800_000;
}

function preferredIconFromMetadata(metadata) {
  const candidates = Array.isArray(metadata?.iconCandidates)
    ? metadata.iconCandidates.filter(candidate => candidate?.icon)
    : [];

  const browserFavicons = candidates
    .filter(candidate => candidate.iconSource === "icon")
    .map((candidate, index) => ({ candidate, index, rank: browserFaviconRank(candidate) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index);

  if (browserFavicons.length) return browserFavicons[0].candidate;

  const apple = candidates.find(candidate => candidate.iconSource === "apple-touch-icon");
  if (apple) return apple;

  const manifest = candidates.find(candidate => candidate.iconSource === "manifest");
  if (manifest) return manifest;

  if (metadata?.icon) {
    return {
      icon: metadata.icon,
      iconSource: metadata.iconSource || "favicon-fallback",
      iconPurpose: metadata.iconPurpose || null,
      iconSizes: metadata.iconSizes || null
    };
  }

  return null;
}

function applyResolvedIcon(app, candidate) {
  app.icon = candidate.icon;
  app.iconSource = candidate.iconSource || "icon";
  app.iconPurpose = candidate.iconPurpose || null;
  app.iconSizes = candidate.iconSizes || null;
  app.iconMetaVersion = ICON_META_VERSION;
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
    const preferred = preferredIconFromMetadata(metadata);

    category.apps.push({
      id: uid("app"),
      name,
      url: normalizedUrl,
      icon: preferred?.icon || `${parsed.origin}/favicon.ico`,
      iconSource: preferred?.iconSource || "favicon-fallback",
      iconPurpose: preferred?.iconPurpose || null,
      iconSizes: preferred?.iconSizes || null,
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
 * Existing stored icons from older resolver versions are migrated once. The
 * migration deliberately uses the browser favicon closest to 32px instead of
 * the largest page/PWA artwork.
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
    const preferred = preferredIconFromMetadata(metadata);

    if (preferred?.icon) {
      const dimensions = await probeImage(preferred.icon);
      const ratioOk = dimensions && dimensions.width > 0 && dimensions.height > 0 &&
        dimensions.width / dimensions.height >= 0.8 &&
        dimensions.width / dimensions.height <= 1.25;

      if (ratioOk) {
        applyResolvedIcon(app, preferred);
        persistState();
        render();
        return;
      }
    }

    const candidates = Array.isArray(metadata?.iconCandidates) ? metadata.iconCandidates : [];
    for (const candidate of candidates) {
      if (!candidate?.icon || candidate.icon === app.icon) continue;
      const dimensions = await probeImage(candidate.icon);
      if (!dimensions) continue;
      const candidateRatio = dimensions.width / dimensions.height;
      if (candidateRatio < 0.8 || candidateRatio > 1.25) continue;

      applyResolvedIcon(app, candidate);
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

/* Ensure cached images that loaded before this deferred script still migrate. */
requestAnimationFrame(() => {
  document.querySelectorAll(".app-item[data-app-id] .app-favicon").forEach(image => {
    const appItem = image.closest(".app-item");
    const categoryWrap = image.closest(".category-wrap");
    if (!appItem?.dataset.appId || !categoryWrap?.dataset.categoryId) return;
    repairAppIconIfNeeded(categoryWrap.dataset.categoryId, appItem.dataset.appId, image);
  });
});
