/**
 * productUrlService — fetch a product page URL and extract metadata from
 * Open Graph / Twitter Card / schema.org tags.
 *
 * Works for most major retailers (Bottega, Theory, Nordstrom, Everlane,
 * Reformation, Net-a-Porter, Gucci, Zara, etc.) since they all ship OG tags
 * for social sharing.
 *
 * Gracefully returns null on any failure (network error, CORS blocked site,
 * no usable tags) — the caller should fall back to letting the user type.
 *
 * fetchProductImages reads the same page for its other pictures, so a wishlist item can show
 * more than the one photo the search result carried. It returns an empty list on any failure.
 */

import { toSecureImageUrl, type LensResult } from './lensSearchService';
import { classifyUrl } from './retailerDomains';
import { cleanResultTitle } from './searchRanking';

type OgMatch = {
  title?: string;
  image?: string;
  description?: string;
  price?: string;
  priceCurrency?: string;
  brand?: string;
  siteName?: string;
};

/**
 * Pull content from a meta tag by regex. Handles both `property=` and `name=`
 * conventions and single/double quotes.
 */
const metaContent = (html: string, key: string): string | undefined => {
  const patterns = [
    new RegExp(
      `<meta\\s+(?:property|name)=["']${key}["']\\s+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${key}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1].trim());
  }
  return undefined;
};

const hasType = (node: any, ...wanted: string[]): boolean => {
  const type = node?.['@type'];
  return Array.isArray(type) ? wanted.some(w => type.includes(w)) : wanted.includes(type);
};

/**
 * The schema.org/Product nodes (and, when asked, ProductGroup nodes) of every JSON-LD block on the page,
 * in page order. Blocks can be an array, a single object or a @graph structure; a block that is not
 * valid JSON is skipped.
 */
const jsonLdProductNodes = (html: string, withGroups = false): any[] => {
  const found: any[] = [];
  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const block = JSON.parse(match[1].trim());
      const nodes: any[] = Array.isArray(block)
        ? block
        : block?.['@graph']
        ? block['@graph']
        : [block];
      for (const node of nodes) if (hasType(node, 'Product') || (withGroups && hasType(node, 'ProductGroup'))) found.push(node);
    } catch {
      // Invalid JSON-LD block — ignore
    }
  }
  return found;
};

/**
 * Extract the first matching value from JSON-LD product schema. Many retailers
 * include schema.org/Product JSON blocks that we can parse for reliable data.
 */
const jsonLdProduct = (html: string): Partial<OgMatch> => {
  const out: Partial<OgMatch> = {};
  for (const node of jsonLdProductNodes(html)) {
    out.title = out.title || node.name;
    out.description = out.description || node.description;
    out.image =
      out.image ||
      (Array.isArray(node.image) ? node.image[0] : node.image);
    out.brand =
      out.brand ||
      (typeof node.brand === 'string'
        ? node.brand
        : node.brand?.name);
    const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
    if (offers) {
      out.price = out.price || offers.price || offers.priceSpecification?.price;
      out.priceCurrency =
        out.priceCurrency ||
        offers.priceCurrency ||
        offers.priceSpecification?.priceCurrency;
    }
  }
  return out;
};

/**
 * Decode common HTML entities in meta-tag strings.
 */
const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));

/**
 * Format a price using the extracted currency (or just return the number if
 * currency is missing). Example: `"198"` + `"USD"` → `"$198"`.
 */
const formatPrice = (raw?: string, currency?: string): string | undefined => {
  if (!raw) return undefined;
  const n = parseFloat(raw.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const symbols: Record<string, string> = {
    USD: '$', CAD: 'CA$', AUD: 'A$',
    GBP: '£', EUR: '€', JPY: '¥', CNY: '¥', INR: '₹',
  };
  const sym = currency ? symbols[currency.toUpperCase()] || `${currency} ` : '$';
  return `${sym}${n}`;
};

/**
 * Extract hostname (without www.) for "source" display.
 */
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

/** The page address with https added when the person pasted it without a scheme. */
const pageUrlOf = (url: string): string => {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

/**
 * The page's HTML, or null when the site answers with an error status. A network failure throws, so each
 * caller decides what that means (both of them turn it into "nothing found").
 */
const fetchPageHtml = async (fullUrl: string): Promise<string | null> => {
  const response = await fetch(fullUrl, {
    headers: {
      // Some sites serve different markup to bots — pose as a browser
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) {
    console.warn('[productUrl] fetch non-ok:', response.status, fullUrl);
    return null;
  }
  return response.text();
};

/**
 * Fetch a URL and parse it into a LensResult-shape record. Returns null if
 * the fetch fails or no usable data is extracted.
 */
export const fetchProductMetadata = async (
  url: string,
): Promise<LensResult | null> => {
  const fullUrl = pageUrlOf(url);

  try {
    const html = await fetchPageHtml(fullUrl);
    if (html === null) return null;

    // Pull from OG / Twitter / JSON-LD in order of preference
    const og: OgMatch = {
      title:
        metaContent(html, 'og:title') ||
        metaContent(html, 'twitter:title'),
      image:
        metaContent(html, 'og:image') ||
        metaContent(html, 'twitter:image'),
      description:
        metaContent(html, 'og:description') ||
        metaContent(html, 'twitter:description'),
      price:
        metaContent(html, 'og:price:amount') ||
        metaContent(html, 'product:price:amount'),
      priceCurrency:
        metaContent(html, 'og:price:currency') ||
        metaContent(html, 'product:price:currency'),
      brand: metaContent(html, 'product:brand'),
      siteName: metaContent(html, 'og:site_name'),
    };

    // Layer JSON-LD on top (only fills blanks)
    const jsonLd = jsonLdProduct(html);
    const merged: OgMatch = {
      title: og.title || jsonLd.title,
      image: og.image || jsonLd.image,
      description: og.description || jsonLd.description,
      price: og.price || jsonLd.price,
      priceCurrency: og.priceCurrency || jsonLd.priceCurrency,
      brand: og.brand || jsonLd.brand,
      siteName: og.siteName,
    };

    // Title fallback: <title>
    if (!merged.title) {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) merged.title = decodeEntities(titleMatch[1].trim());
    }

    if (!merged.title && !merged.image) {
      console.warn('[productUrl] no usable metadata in', fullUrl);
      return null;
    }

    const source = hostOf(fullUrl) || merged.siteName || 'unknown';
    return {
      id: `url-${Date.now()}`,
      // "Gucci Jackie | GUCCI US" becomes the item's name: drop the site suffix.
      title: cleanResultTitle(merged.title || source, source, 120),
      source,
      url: fullUrl,
      // iOS blocks plain-http pictures: use the https form, and nothing that is not a web URL.
      imageUrl: toSecureImageUrl(merged.image),
      price: formatPrice(merged.price, merged.priceCurrency),
      similarity: 1, // user-chosen URL is a perfect "match"
      isShopping: true,
      sourceKind: classifyUrl(fullUrl),
    };
  } catch (e: any) {
    console.warn('[productUrl] fetch failed:', e?.message);
    return null;
  }
};

// ─── Every picture on a product page ─────────────────────────────────────────

/** The most pictures taken from one page. */
export const MAX_PRODUCT_IMAGES = 6;

/** All <meta> tags of the page as (property or name, content), whatever order their attributes come in. */
const metaTags = (html: string): Array<{ key: string; content: string }> => {
  const out: Array<{ key: string; content: string }> = [];
  const tagRegex = /<meta\b[^>]*>/gi;
  const attrRegex = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let tag: RegExpExecArray | null;
  while ((tag = tagRegex.exec(html)) !== null) {
    const attrs: Record<string, string> = {};
    let attr: RegExpExecArray | null;
    attrRegex.lastIndex = 0;
    while ((attr = attrRegex.exec(tag[0])) !== null) attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? '';
    const key = (attrs.property || attrs.name || '').trim().toLowerCase();
    const content = (attrs.content || '').trim();
    if (key && content) out.push({ key, content: decodeEntities(content) });
  }
  return out;
};

/** A JSON-LD `image` value: a link, an ImageObject ({ url } or { contentUrl }), or a list of either. */
const imageValues = (value: unknown, depth = 0): string[] => {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object' || depth > 3) return [];
  if (Array.isArray(value)) return value.flatMap(v => imageValues(v, depth + 1));
  const o = value as Record<string, unknown>;
  return imageValues(o.url ?? o.contentUrl, depth + 1);
};

/** Pictures that are not of the product: logos, icons, sprites, placeholders, tracking pixels, vector art. */
const NOT_A_PRODUCT_PICTURE = /(^|[\/_.\-\d])(logos?|favicons?|sprites?|icons?|placeholders?|spacer|pixel|tracking|beacon|1x1)([\/_.\-\d]|$)/i;

const isProductPicture = (url: string): boolean => {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname);
    if (/\.svg$/i.test(path)) return false;
    if (NOT_A_PRODUCT_PICTURE.test(path)) return false;
    // A 1-pixel picture asked for by size, e.g. /t.gif?w=1&h=1
    return !/[?&](?:w|width)=1(?:&|$)/i.test(u.search);
  } catch {
    return false;
  }
};

/**
 * The pictures on a product page, best first, at most MAX_PRODUCT_IMAGES: the schema.org Product `image`
 * (a link, a list, or ImageObjects), then every og:image / og:image:secure_url, then twitter:image, each in
 * page order. Relative links are resolved against the page; plain http becomes https; logos, icons,
 * sprites, placeholders, tracking pixels, vector art and data: links are left out; repeats are dropped.
 * Never throws: a page that cannot be read gives [].
 */
export const fetchProductImages = async (url: string): Promise<string[]> => {
  try {
    if (typeof url !== 'string' || !url.trim()) return [];
    const pageUrl = pageUrlOf(url);
    const html = await fetchPageHtml(pageUrl);
    if (html === null) return [];

    const meta = metaTags(html);
    const metaOf = (...keys: string[]) => meta.filter(m => keys.includes(m.key)).map(m => m.content);
    const candidates = [
      ...jsonLdProductNodes(html, true).flatMap(node => imageValues(node.image)),
      ...metaOf('og:image', 'og:image:secure_url', 'og:image:url'),
      ...metaOf('twitter:image', 'twitter:image:src'),
    ];

    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of candidates) {
      const candidate = raw.trim();
      if (!candidate || /^data:/i.test(candidate)) continue;
      let resolved: string;
      try {
        resolved = new URL(candidate, pageUrl).toString();
      } catch {
        continue;
      }
      const image = toSecureImageUrl(resolved);
      if (!image || !isProductPicture(image) || seen.has(image)) continue;
      seen.add(image);
      out.push(image);
      if (out.length >= MAX_PRODUCT_IMAGES) break;
    }
    return out;
  } catch (e: any) {
    console.warn('[productUrl] could not read the pictures of', url, e?.message);
    return [];
  }
};
