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
 */

import type { LensResult } from './lensSearchService';

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

/**
 * Extract the first matching value from JSON-LD product schema. Many retailers
 * include schema.org/Product JSON blocks that we can parse for reliable data.
 */
const jsonLdProduct = (html: string): Partial<OgMatch> => {
  const out: Partial<OgMatch> = {};
  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const block = JSON.parse(match[1].trim());
      // Blocks can be arrays or a single object or a @graph structure
      const nodes: any[] = Array.isArray(block)
        ? block
        : block['@graph']
        ? block['@graph']
        : [block];
      for (const node of nodes) {
        if (node['@type'] === 'Product' || (Array.isArray(node['@type']) && node['@type'].includes('Product'))) {
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
      }
    } catch {
      // Invalid JSON-LD block — ignore
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

/**
 * Fetch a URL and parse it into a LensResult-shape record. Returns null if
 * the fetch fails or no usable data is extracted.
 */
export const fetchProductMetadata = async (
  url: string,
): Promise<LensResult | null> => {
  let fullUrl = url.trim();
  if (!/^https?:\/\//i.test(fullUrl)) fullUrl = `https://${fullUrl}`;

  try {
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
    const html = await response.text();

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
      title: (merged.title || source).substring(0, 120),
      source,
      url: fullUrl,
      imageUrl: /^https?:\/\//i.test(merged.image || '') ? merged.image! : '',
      price: formatPrice(merged.price, merged.priceCurrency),
      similarity: 1, // user-chosen URL is a perfect "match"
      isShopping: true,
    };
  } catch (e: any) {
    console.warn('[productUrl] fetch failed:', e?.message);
    return null;
  }
};
