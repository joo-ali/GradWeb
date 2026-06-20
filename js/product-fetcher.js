// Product preview helper for GradWeb.
// It mirrors the GradApp addPage logic: fetch HTML, read OpenGraph/Twitter/JSON-LD data,
// then return { title, price, imageUrl }.

const DEFAULT_PROXY = "https://api.allorigins.win/raw?url=";

function normalizeWebUrl(input = "") {
  const value = String(input || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function cleanExtractedText(value) {
  if (!value) return "";

  const textarea = document.createElement("textarea");
  textarea.innerHTML = String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return textarea.value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMetaContent(html, attrPattern) {
  const regex1 = new RegExp(
    `<meta[^>]*${attrPattern}[^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );

  const regex2 = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*${attrPattern}[^>]*>`,
    "i"
  );

  const match = html.match(regex1) || html.match(regex2);
  return match?.[1]?.trim() || "";
}

function extractFirstImageFromHtml(html) {
  const match = html.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i);
  return match?.[1]?.trim() || "";
}

function resolveImageUrl(baseUrl, rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";

  try {
    if (value.startsWith("//")) return `https:${value}`;

    const parsed = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";

    if (parsed.protocol === "http:") parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return "";
  }
}

function extractTitleTag(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.trim() || "";
}

function extractH1Text(html) {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return match?.[1]?.trim() || "";
}

function extractJsonLdStringField(html, fieldName) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const script of scripts) {
    const raw = cleanExtractedText(script[1]);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const found = findJsonLdField(parsed, fieldName);
      if (found !== undefined && found !== null && String(found).trim()) return String(found).trim();
    } catch {
      const fallbackRegex = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]+)"`, "i");
      const match = raw.match(fallbackRegex);
      if (match?.[1]) return match[1].trim();
    }
  }

  const looseRegex = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]+)"`, "i");
  const looseMatch = html.match(looseRegex);
  return looseMatch?.[1]?.trim() || "";
}

function findJsonLdField(node, fieldName) {
  if (!node) return undefined;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJsonLdField(item, fieldName);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  if (typeof node === "object") {
    if (Object.prototype.hasOwnProperty.call(node, fieldName)) {
      const value = node[fieldName];
      if (typeof value === "object") {
        const nested = findJsonLdField(value, fieldName);
        return nested !== undefined ? nested : undefined;
      }
      return value;
    }

    // Common JSON-LD price shape: offers: { price: "..." }
    if (fieldName === "price" && node.offers) {
      const offerPrice = findJsonLdField(node.offers, "price");
      if (offerPrice !== undefined) return offerPrice;
    }

    for (const value of Object.values(node)) {
      const found = findJsonLdField(value, fieldName);
      if (found !== undefined) return found;
    }
  }

  return undefined;
}

function extractVisiblePrice(html) {
  const match = html.match(/(?:(?:EGP|USD|EUR|ج\.م|جنيه|\$|£|€)\s*([0-9]+(?:[.,][0-9]{1,2})?)|([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:EGP|USD|EUR|ج\.م|جنيه|\$|£|€))/i);
  return match ? (match[1] || match[2] || "") : "";
}

function parsePrice(value) {
  if (value === undefined || value === null) return null;

  let cleaned = String(value).trim().replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;

  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",") && !cleaned.includes(".")) {
    cleaned = cleaned.replace(/,/g, ".");
  }

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractProductTitle(html) {
  const candidates = [
    extractMetaContent(html, "property=[\\\"']og:title[\\\"']"),
    extractMetaContent(html, "name=[\\\"']og:title[\\\"']"),
    extractMetaContent(html, "name=[\\\"']twitter:title[\\\"']"),
    extractTitleTag(html),
    extractJsonLdStringField(html, "name"),
    extractH1Text(html),
  ];

  for (const candidate of candidates) {
    const cleaned = cleanExtractedText(candidate);
    if (cleaned) return cleaned;
  }

  return "";
}

function extractProductPrice(html) {
  const candidates = [
    extractMetaContent(html, "property=[\\\"']product:price:amount[\\\"']"),
    extractMetaContent(html, "name=[\\\"']product:price:amount[\\\"']"),
    extractMetaContent(html, "property=[\\\"']og:price:amount[\\\"']"),
    extractMetaContent(html, "name=[\\\"']price[\\\"']"),
    extractJsonLdStringField(html, "price"),
    extractVisiblePrice(html),
  ];

  for (const candidate of candidates) {
    const parsed = parsePrice(candidate);
    if (parsed !== null) return parsed;
  }

  return null;
}

async function fetchHtml(url) {
  const normalizedUrl = normalizeWebUrl(url);
  if (!normalizedUrl) throw new Error("Please enter a valid item link first.");

  const headers = {
    Accept: "text/html,application/xhtml+xml",
    "ngrok-skip-browser-warning": "true",
  };

  // First: direct fetch. Works only for websites that allow browser CORS.
  try {
    const direct = await fetch(normalizedUrl, { headers, redirect: "follow" });
    if (direct.ok) {
      const text = await direct.text();
      if (text && /<html|<meta|<title|application\/ld\+json/i.test(text)) {
        return { html: text, finalUrl: direct.url || normalizedUrl };
      }
    }
  } catch {
    // Browser CORS is expected on many shops; use proxy fallback below.
  }

  // Second: public proxy fallback for web demo. For production, replace with your own
  // Strapi custom endpoint or Supabase Edge Function.
  const proxyBase = localStorage.getItem("PRODUCT_PREVIEW_PROXY") || DEFAULT_PROXY;
  const proxyUrl = `${proxyBase}${encodeURIComponent(normalizedUrl)}`;
  const proxied = await fetch(proxyUrl, { headers: { Accept: "text/html" } });

  if (!proxied.ok) {
    throw new Error(`Failed to fetch item details (${proxied.status}).`);
  }

  const html = await proxied.text();
  if (!html || !html.trim()) throw new Error("Could not read product page.");

  return { html, finalUrl: normalizedUrl };
}

export async function fetchProductDetailsFromWeb(pageUrl) {
  const normalizedUrl = normalizeWebUrl(pageUrl);
  const { html, finalUrl } = await fetchHtml(normalizedUrl);
  const baseUrl = finalUrl || normalizedUrl;

  const imageCandidates = [
    extractMetaContent(html, "property=[\\\"']og:image[\\\"']"),
    extractMetaContent(html, "name=[\\\"']og:image[\\\"']"),
    extractMetaContent(html, "property=[\\\"']twitter:image[\\\"']"),
    extractMetaContent(html, "name=[\\\"']twitter:image[\\\"']"),
    extractFirstImageFromHtml(html),
  ];

  let imageUrl = "";
  for (const candidate of imageCandidates) {
    const resolved = resolveImageUrl(baseUrl, candidate);
    if (resolved) {
      imageUrl = resolved;
      break;
    }
  }

  const title = extractProductTitle(html);
  const price = extractProductPrice(html);

  if (!title && price === null && !imageUrl) {
    throw new Error("No product details found. Please fill the form manually.");
  }

  return {
    title,
    price,
    imageUrl,
    url: normalizedUrl,
  };
}
