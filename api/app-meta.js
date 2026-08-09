const dns = require("node:dns").promises;
const net = require("node:net");

const USER_AGENT = "Mozilla/5.0 (compatible; Loopen/1.0; +https://github.com/lowen-hsu/Loopen)";
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 7000;
const MAX_TEXT_LENGTH = 800000;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const rawUrl = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
  if (!rawUrl) return res.status(400).json({ error: "missing_url" });

  try {
    const startUrl = normalizeHttpUrl(rawUrl);
    const page = await safeFetch(startUrl, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5");
    if (!page.response.ok) throw new Error(`page_http_${page.response.status}`);

    const html = (await page.response.text()).slice(0, MAX_TEXT_LENGTH);
    const pageUrl = page.url;
    const links = parseLinkTags(html);
    const title = extractTitle(html);
    const candidates = [];
    let manifestName = null;

    const manifestUrls = [];
    const linkedManifest = links.find(link => link.rel.includes("manifest") && link.href);
    if (linkedManifest) manifestUrls.push(new URL(decodeHtmlEntities(linkedManifest.href), pageUrl).href);

    /* Some small/self-hosted PWAs expose a manifest without a usable <link rel="manifest">. */
    manifestUrls.push(
      new URL("/manifest.webmanifest", pageUrl).href,
      new URL("/manifest.json", pageUrl).href
    );

    for (const manifestUrl of [...new Set(manifestUrls)]) {
      try {
        const manifestFetch = await safeFetch(manifestUrl, "application/manifest+json,application/json,text/plain;q=0.8,*/*;q=0.4");
        if (!manifestFetch.response.ok) continue;
        const manifestText = (await manifestFetch.response.text()).slice(0, 500000).replace(/^\uFEFF/, "");
        const manifest = JSON.parse(manifestText);
        if (!manifestName) manifestName = cleanText(manifest.short_name || manifest.name || "");

        for (const icon of Array.isArray(manifest.icons) ? manifest.icons : []) {
          if (!icon || typeof icon.src !== "string" || !icon.src.trim()) continue;
          if (isMonochromeOnly(icon)) continue;
          candidates.push({
            url: new URL(icon.src, manifestFetch.url).href,
            source: "manifest",
            purpose: String(icon.purpose || "any").toLowerCase(),
            sizes: String(icon.sizes || ""),
            type: String(icon.type || ""),
            score: manifestIconScore(icon)
          });
        }
      } catch (error) {
        /* Common manifest fallbacks often do not exist; silently continue. */
      }
    }

    for (const link of links.filter(link => link.href && link.rel.includes("apple-touch-icon"))) {
      candidates.push({
        url: new URL(decodeHtmlEntities(link.href), pageUrl).href,
        source: "apple-touch-icon",
        purpose: null,
        sizes: link.sizes || "",
        type: link.type || "",
        score: 6_000_000 + htmlIconScore(link)
      });
    }

    for (const link of links.filter(link => link.href && link.rel.includes("icon") && !link.rel.includes("apple-touch-icon"))) {
      candidates.push({
        url: new URL(decodeHtmlEntities(link.href), pageUrl).href,
        source: "icon",
        purpose: null,
        sizes: link.sizes || "",
        type: link.type || "",
        score: 2_000_000 + htmlIconScore(link)
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] || {
      url: new URL("/favicon.ico", pageUrl).href,
      source: "favicon-fallback",
      purpose: null,
      sizes: null,
      type: null
    };

    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json({
      url: pageUrl,
      name: manifestName || title || null,
      icon: best.url,
      iconSource: best.source,
      iconPurpose: best.purpose,
      iconSizes: best.sizes,
      iconCandidates: candidates.slice(0, 6).map(candidate => ({
        icon: candidate.url,
        iconSource: candidate.source,
        iconPurpose: candidate.purpose,
        iconSizes: candidate.sizes
      }))
    });
  } catch (error) {
    console.warn("Loopen app metadata lookup failed", error?.message || error);
    return res.status(200).json({
      url: null,
      name: null,
      icon: null,
      iconSource: null,
      iconPurpose: null,
      iconSizes: null,
      iconCandidates: [],
      fallback: true
    });
  }
};

function normalizeHttpUrl(raw) {
  let value = String(raw || "").trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid_protocol");
  if (url.username || url.password) throw new Error("credentials_not_allowed");
  return url.href;
}

async function safeFetch(rawUrl, accept) {
  let current = normalizeHttpUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicDestination(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": accept,
          "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7"
        }
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { response, url: current };
      current = new URL(location, current).href;
      continue;
    }
    return { response, url: current };
  }
  throw new Error("too_many_redirects");
}

async function assertPublicDestination(rawUrl) {
  const url = new URL(rawUrl);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("private_host_not_allowed");
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("private_ip_not_allowed");
    return;
  }
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => isPrivateIp(entry.address))) throw new Error("private_destination_not_allowed");
}

function isPrivateIp(address) {
  if (!address) return true;
  const lower = address.toLowerCase();
  if (net.isIPv6(lower)) {
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    if (lower.startsWith("2001:db8:")) return true;
    if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7));
    return false;
  }
  if (!net.isIPv4(lower)) return true;
  const [a, b] = lower.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function parseLinkTags(html) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  return tags.map(tag => {
    const attrs = {};
    const attrPattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
    let match;
    while ((match = attrPattern.exec(tag))) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    return {
      href: attrs.href || "",
      rel: String(attrs.rel || "").toLowerCase().split(/\s+/).filter(Boolean),
      sizes: attrs.sizes || "",
      type: attrs.type || ""
    };
  });
}

function isMonochromeOnly(icon) {
  const purposes = String(icon.purpose || "any").toLowerCase().split(/\s+/).filter(Boolean);
  return purposes.includes("monochrome") && !purposes.includes("any") && !purposes.includes("maskable");
}

function manifestIconScore(icon) {
  const purpose = String(icon.purpose || "any").toLowerCase();
  const type = String(icon.type || "").toLowerCase();
  const src = String(icon.src || "").toLowerCase();
  let score = rasterSizeScore(icon.sizes);
  if (purpose.includes("any")) score += 9_000_000;
  else if (purpose.includes("maskable")) score += 4_000_000;
  if (purpose.includes("monochrome")) score -= 9_000_000;
  if (type.includes("png") || src.includes(".png")) score += 3_000_000;
  else if (type.includes("webp") || src.includes(".webp")) score += 2_500_000;
  else if (type.includes("svg") || src.includes(".svg")) score += 250_000;
  return score;
}

function htmlIconScore(icon) {
  const type = String(icon.type || "").toLowerCase();
  const href = String(icon.href || "").toLowerCase();
  let score = rasterSizeScore(icon.sizes);
  if (type.includes("png") || href.includes(".png")) score += 1_500_000;
  else if (type.includes("webp") || href.includes(".webp")) score += 1_250_000;
  else if (type.includes("svg") || href.includes(".svg")) score += 100_000;
  return score;
}

function rasterSizeScore(sizes) {
  const value = String(sizes || "").toLowerCase();
  if (value.includes("any")) return 1_048_576;
  let best = 0;
  for (const match of value.matchAll(/(\d+)x(\d+)/g)) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) continue;
    const squarePenalty = Math.abs(width - height) * 1000;
    best = Math.max(best, Math.min(width * height, 4_194_304) - squarePenalty);
  }
  return best;
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(decodeHtmlEntities(match[1])) : "";
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}
