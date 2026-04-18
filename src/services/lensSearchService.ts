/**
 * lensSearchService — "Google Lens for clothes".
 *
 * Pipeline:
 *   1. User picks a photo.
 *   2. We call Google Cloud Vision with WEB_DETECTION + LABEL_DETECTION +
 *      IMAGE_PROPERTIES.
 *   3. WEB_DETECTION gives us `visuallySimilarImages`, `pagesWithMatchingImages`,
 *      and `bestGuessLabels` — this IS Google Lens reverse image search.
 *   4. We classify pages as shopping/not-shopping by hostname matching a known
 *      retailer list.
 *   5. For shopping results, we return a structured LensResult with whatever
 *      metadata Vision gave us. (Price parsing via OG tags is deferred — needs
 *      a server-side proxy to get around CORS on web.)
 *
 * Degrades gracefully: if no API key, returns a single "stub" result explaining
 * how to configure. If the API call fails, returns an empty array + error flag.
 */

import { env, hasGoogleVision } from '../config/env';
import { readImageAsBase64 } from '../platform/fileSystem';

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

// Known shopping/retail hostnames. Keep alphabetical.
const SHOPPING_HOSTS = new Set([
  'amazon.com',
  'amazon.co.uk',
  'asos.com',
  'ae.com',
  'anthropologie.com',
  'aritzia.com',
  'asos.com',
  'banana-republic.com',
  'bananarepublic.com',
  'bananarepublic.gap.com',
  'bloomingdales.com',
  'boohoo.com',
  'cos.com',
  'everlane.com',
  'express.com',
  'farfetch.com',
  'forever21.com',
  'freepeople.com',
  'gap.com',
  'gucci.com',
  'hm.com',
  'hollisterco.com',
  'jcrew.com',
  'kohls.com',
  'lululemon.com',
  'lvmh.com',
  'macys.com',
  'madewell.com',
  'marksandspencer.com',
  'mrporter.com',
  'mytheresa.com',
  'net-a-porter.com',
  'nike.com',
  'nordstrom.com',
  'nordstromrack.com',
  'oldnavy.gap.com',
  'rei.com',
  'revolve.com',
  'ssense.com',
  'target.com',
  'topshop.com',
  'uniqlo.com',
  'urbanoutfitters.com',
  'walmart.com',
  'wayfair.com',
  'westelm.com',
  'zalando.com',
  'zara.com',
]);

export type LensResult = {
  id: string;
  title: string;
  /** Best guess at merchant, from the hostname. */
  source: string;
  url: string;
  imageUrl: string;
  price?: string;
  /** 0..1, higher = more similar. Comes from Vision's score. */
  similarity: number;
  /** True if source is a known shopping site. */
  isShopping: boolean;
};

export type LensSearchResponse = {
  query: string;
  bestGuessLabels: string[];
  results: LensResult[];
  error?: string;
  /** True if Vision could not be called (no API key, etc). UI should show config hint. */
  notConfigured?: boolean;
};

const normalizeHost = (url: string): string => {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

const isShoppingHost = (host: string): boolean => {
  if (SHOPPING_HOSTS.has(host)) return true;
  // Subdomain match
  for (const known of SHOPPING_HOSTS) {
    if (host.endsWith('.' + known)) return true;
  }
  return false;
};

export const searchByImage = async (imageUri: string): Promise<LensSearchResponse> => {
  if (!hasGoogleVision() || !env.ENABLE_REVERSE_IMAGE_SEARCH) {
    return {
      query: '',
      bestGuessLabels: [],
      results: [],
      notConfigured: true,
    };
  }

  try {
    const base64 = await readImageAsBase64(imageUri);

    const response = await fetch(`${VISION_ENDPOINT}?key=${env.GOOGLE_VISION_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [
              { type: 'WEB_DETECTION', maxResults: 20 },
              { type: 'LABEL_DETECTION', maxResults: 8 },
              { type: 'IMAGE_PROPERTIES' },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      return {
        query: '',
        bestGuessLabels: [],
        results: [],
        error: `Vision API ${response.status}: ${txt.substring(0, 120)}`,
      };
    }

    const data = await response.json();
    const first = data.responses?.[0] ?? {};
    const web = first.webDetection ?? {};
    const labels = (first.labelAnnotations ?? []).map((l: any) => l.description);

    const bestGuessLabels: string[] = (web.bestGuessLabels ?? []).map(
      (g: any) => g.label,
    );
    const query = bestGuessLabels[0] || labels.slice(0, 3).join(' ');

    // Build results from pagesWithMatchingImages + visuallySimilarImages.
    // Prefer pages with matching images (they link to actual pages) over
    // standalone images.
    const pages: any[] = web.pagesWithMatchingImages ?? [];
    const similarImages: any[] = web.visuallySimilarImages ?? [];

    const results: LensResult[] = [];
    const seen = new Set<string>();

    pages.forEach((p, idx) => {
      if (!p.url) return;
      const host = normalizeHost(p.url);
      if (!host || seen.has(p.url)) return;
      seen.add(p.url);

      // Pick a thumbnail: matching full image > partial > page main image
      const imageUrl: string =
        p.fullMatchingImages?.[0]?.url
        ?? p.partialMatchingImages?.[0]?.url
        ?? p.pageTitle
        ?? similarImages[idx]?.url
        ?? '';

      results.push({
        id: `page-${idx}`,
        title: (p.pageTitle || host).substring(0, 80),
        source: host,
        url: p.url,
        imageUrl,
        similarity: p.score ?? 0,
        isShopping: isShoppingHost(host),
      });
    });

    // Fall back to visuallySimilarImages if we got almost no pages
    if (results.length < 4) {
      similarImages.forEach((img, idx) => {
        if (!img.url || seen.has(img.url)) return;
        seen.add(img.url);
        const host = normalizeHost(img.url);
        results.push({
          id: `sim-${idx}`,
          title: host || 'Similar image',
          source: host,
          url: img.url,
          imageUrl: img.url,
          similarity: img.score ?? 0.5,
          isShopping: isShoppingHost(host),
        });
      });
    }

    // Sort: shopping results first, then by similarity descending
    results.sort((a, b) => {
      if (a.isShopping !== b.isShopping) return a.isShopping ? -1 : 1;
      return b.similarity - a.similarity;
    });

    return {
      query,
      bestGuessLabels,
      results: results.slice(0, 30),
    };
  } catch (error: any) {
    return {
      query: '',
      bestGuessLabels: [],
      results: [],
      error: error?.message ?? 'Unknown error',
    };
  }
};

// ─── Text-based product search ──────────────────────────────────────────────

/**
 * Curated fallback catalog used when no Google Custom Search key is configured.
 * Keeps the demo usable offline. Entries are real-looking stylist-grade pieces
 * spanning categories, colors, price ranges, and retailers.
 */
const FALLBACK_CATALOG: LensResult[] = [
  {
    id: 'cat_001',
    title: 'Burgundy Leather Top-Handle Clutch',
    source: 'net-a-porter.com',
    url: 'https://www.net-a-porter.com/en-us/shop/product/clutch-burgundy',
    imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=500',
    price: '$2,800',
    similarity: 0.95,
    isShopping: true,
  },
  {
    id: 'cat_002',
    title: 'Bottega Veneta Andiamo Clutch',
    source: 'bottegaveneta.com',
    url: 'https://www.bottegaveneta.com/en-us/andiamo-clutch',
    imageUrl: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=500',
    price: '$3,400',
    similarity: 0.93,
    isShopping: true,
  },
  {
    id: 'cat_003',
    title: 'Cream Cashmere Wrap Coat',
    source: 'maxmara.com',
    url: 'https://www.maxmara.com/us/cashmere-wrap-coat',
    imageUrl: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=500',
    price: '$2,390',
    similarity: 0.91,
    isShopping: true,
  },
  {
    id: 'cat_004',
    title: 'Camel Double-Breasted Wool Coat',
    source: 'toteme.com',
    url: 'https://www.toteme.com/double-breasted-wool-coat',
    imageUrl: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=500',
    price: '$1,290',
    similarity: 0.87,
    isShopping: true,
  },
  {
    id: 'cat_005',
    title: 'White Leather Low-Top Sneakers',
    source: 'ssense.com',
    url: 'https://www.ssense.com/en-us/common-projects-achilles-low',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500',
    price: '$425',
    similarity: 0.90,
    isShopping: true,
  },
  {
    id: 'cat_006',
    title: "Levi's 501 Straight-Leg Jeans",
    source: 'levis.com',
    url: 'https://www.levis.com/us/en_US/clothing/women/jeans/501-original',
    imageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500',
    price: '$98',
    similarity: 0.89,
    isShopping: true,
  },
  {
    id: 'cat_007',
    title: 'Silk Bias-Cut Slip Dress, Champagne',
    source: 'reformation.com',
    url: 'https://www.thereformation.com/products/silk-slip-dress',
    imageUrl: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=500',
    price: '$248',
    similarity: 0.88,
    isShopping: true,
  },
  {
    id: 'cat_008',
    title: 'Black Merino Turtleneck',
    source: 'uniqlo.com',
    url: 'https://www.uniqlo.com/us/en/products/merino-turtleneck',
    imageUrl: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=500',
    price: '$49.90',
    similarity: 0.86,
    isShopping: true,
  },
  {
    id: 'cat_009',
    title: 'Navy Wool-Blend Blazer',
    source: 'theory.com',
    url: 'https://www.theory.com/womens-blazer-navy',
    imageUrl: 'https://images.unsplash.com/photo-1507679799987-c73b4177ae68?w=500',
    price: '$525',
    similarity: 0.85,
    isShopping: true,
  },
  {
    id: 'cat_010',
    title: 'Wide-Leg Wool Trousers, Charcoal',
    source: 'toteme.com',
    url: 'https://www.toteme.com/wide-leg-wool-trousers',
    imageUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500',
    price: '$540',
    similarity: 0.84,
    isShopping: true,
  },
  {
    id: 'cat_011',
    title: 'Linen Button-Down, White',
    source: 'cos.com',
    url: 'https://www.cos.com/en/linen-button-down',
    imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500',
    price: '$89',
    similarity: 0.83,
    isShopping: true,
  },
  {
    id: 'cat_012',
    title: 'Cashmere Crewneck Sweater, Oatmeal',
    source: 'naadam.com',
    url: 'https://www.naadam.co/products/cashmere-crewneck',
    imageUrl: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=500',
    price: '$125',
    similarity: 0.82,
    isShopping: true,
  },
  {
    id: 'cat_013',
    title: 'Gold Chunky Hoop Earrings',
    source: 'mejuri.com',
    url: 'https://mejuri.com/shop/products/chunky-hoops-gold',
    imageUrl: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=500',
    price: '$148',
    similarity: 0.80,
    isShopping: true,
  },
  {
    id: 'cat_014',
    title: 'Tailored Ankle Pants, Black',
    source: 'theory.com',
    url: 'https://www.theory.com/ankle-pants-black',
    imageUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500',
    price: '$265',
    similarity: 0.79,
    isShopping: true,
  },
  {
    id: 'cat_015',
    title: 'Brown Leather Chelsea Boots',
    source: 'everlane.com',
    url: 'https://www.everlane.com/products/womens-chelsea-boot-brown',
    imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500',
    price: '$198',
    similarity: 0.78,
    isShopping: true,
  },
  {
    id: 'cat_016',
    title: 'Oversized Linen Dress, Sand',
    source: 'cos.com',
    url: 'https://www.cos.com/en/oversized-linen-dress',
    imageUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500',
    price: '$135',
    similarity: 0.77,
    isShopping: true,
  },
  {
    id: 'cat_017',
    title: 'Silk Shell Top, Ivory',
    source: 'vince.com',
    url: 'https://www.vince.com/silk-shell-top-ivory',
    imageUrl: 'https://images.unsplash.com/photo-1564257577802-5c0c7e0b7b99?w=500',
    price: '$195',
    similarity: 0.76,
    isShopping: true,
  },
  {
    id: 'cat_018',
    title: 'Wide-Leg Chinos, Sand',
    source: 'everlane.com',
    url: 'https://www.everlane.com/products/wide-leg-chinos-sand',
    imageUrl: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=500',
    price: '$78',
    similarity: 0.75,
    isShopping: true,
  },
  {
    id: 'cat_019',
    title: 'Performance Travel Blazer, Navy',
    source: 'ministryofsupply.com',
    url: 'https://ministryofsupply.com/products/travel-blazer-navy',
    imageUrl: 'https://images.unsplash.com/photo-1507679799987-c73b4177ae68?w=500',
    price: '$295',
    similarity: 0.74,
    isShopping: true,
  },
  {
    id: 'cat_020',
    title: 'Merino Performance Polo, Charcoal',
    source: 'woolandprince.com',
    url: 'https://woolandprince.com/products/merino-polo-charcoal',
    imageUrl: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=500',
    price: '$128',
    similarity: 0.73,
    isShopping: true,
  },
  {
    id: 'cat_021',
    title: 'Black Leather Ankle Boots',
    source: 'madewell.com',
    url: 'https://www.madewell.com/leather-ankle-boots-black',
    imageUrl: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=500',
    price: '$258',
    similarity: 0.72,
    isShopping: true,
  },
  {
    id: 'cat_022',
    title: 'Straw Sun Hat, Natural',
    source: 'anthropologie.com',
    url: 'https://www.anthropologie.com/straw-sun-hat',
    imageUrl: 'https://images.unsplash.com/photo-1571513800374-df1bbe650e56?w=500',
    price: '$68',
    similarity: 0.71,
    isShopping: true,
  },
  {
    id: 'cat_023',
    title: 'Leather Tote Bag, Cognac',
    source: 'madewell.com',
    url: 'https://www.madewell.com/transport-tote-cognac',
    imageUrl: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=500',
    price: '$188',
    similarity: 0.70,
    isShopping: true,
  },
  {
    id: 'cat_024',
    title: 'Pleated Midi Skirt, Olive',
    source: 'aritzia.com',
    url: 'https://www.aritzia.com/en/pleated-midi-skirt-olive',
    imageUrl: 'https://images.unsplash.com/photo-1583496661160-fb5886a13d44?w=500',
    price: '$148',
    similarity: 0.69,
    isShopping: true,
  },
  {
    id: 'cat_025',
    title: 'Classic Trench Coat, Khaki',
    source: 'burberry.com',
    url: 'https://www.burberry.com/classic-trench',
    imageUrl: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=500',
    price: '$2,190',
    similarity: 0.68,
    isShopping: true,
  },
];

/**
 * Tokenize a string into lowercase words, stripping punctuation.
 */
const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * Score a catalog entry against a tokenized query. Simple token-match scoring:
 * +1 for each query token found in the entry's title/source, +0.5 for partial
 * substring match. This keeps demo results intuitive without needing a real
 * search engine.
 */
const scoreEntry = (entry: LensResult, queryTokens: string[]): number => {
  if (queryTokens.length === 0) return 0;
  const haystack = `${entry.title} ${entry.source}`.toLowerCase();
  let score = 0;
  for (const tok of queryTokens) {
    if (!tok) continue;
    if (haystack.includes(tok)) {
      // Exact word boundary match scores higher
      const re = new RegExp(`\\b${tok}\\b`);
      score += re.test(haystack) ? 1 : 0.5;
    }
  }
  return score;
};

/**
 * Search for products by text query. Uses Google Custom Search (Image mode)
 * if configured, otherwise falls back to an in-memory curated catalog so the
 * feature still works in demos / offline.
 */
export const searchProductsByText = async (
  query: string,
): Promise<LensSearchResponse> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return { query: '', bestGuessLabels: [], results: [] };
  }

  // ── Google Custom Search path (if configured) ──
  if (env.GOOGLE_CSE_ID && env.GOOGLE_CSE_API_KEY) {
    try {
      const params = new URLSearchParams({
        key: env.GOOGLE_CSE_API_KEY,
        cx: env.GOOGLE_CSE_ID,
        q: trimmed,
        searchType: 'image',
        num: '10',
        safe: 'active',
      });
      const resp = await fetch(
        `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
      );
      if (resp.ok) {
        const data = await resp.json();
        const items: any[] = data.items || [];
        const results: LensResult[] = items.map((it, idx) => {
          const pageUrl: string = it.image?.contextLink || it.link || '';
          const host = normalizeHost(pageUrl);
          return {
            id: `cse-${idx}`,
            title: (it.title || host || 'Result').substring(0, 80),
            source: host,
            url: pageUrl,
            imageUrl: it.link || it.image?.thumbnailLink || '',
            similarity: 1 - idx * 0.05,
            isShopping: isShoppingHost(host),
          };
        });
        // Shopping first
        results.sort((a, b) => {
          if (a.isShopping !== b.isShopping) return a.isShopping ? -1 : 1;
          return b.similarity - a.similarity;
        });
        return {
          query: trimmed,
          bestGuessLabels: [trimmed],
          results,
        };
      }
      // Non-OK response falls through to catalog fallback
      console.warn('[lensSearchService] CSE API error:', resp.status);
    } catch (e: any) {
      console.warn('[lensSearchService] CSE fetch failed, using catalog:', e?.message);
    }
  }

  // ── Fallback: curated catalog with token-match scoring ──
  const queryTokens = tokenize(trimmed);
  const scored = FALLBACK_CATALOG.map(entry => ({
    entry,
    score: scoreEntry(entry, queryTokens),
  }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // If nothing matched by tokens, fall back to the whole catalog (surfaces
  // something rather than an empty state).
  const results =
    scored.length > 0
      ? scored.map(s => s.entry)
      : FALLBACK_CATALOG.slice(0, 12);

  return {
    query: trimmed,
    bestGuessLabels: [trimmed],
    results,
  };
};
