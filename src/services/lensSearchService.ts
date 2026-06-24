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
import { callAiProxy } from './aiProxy';

// Known shopping/retail hostnames. Keep alphabetical.
// Covers: fast fashion, mid-market, contemporary, luxury, department, and
// resale. Subdomain matching in isShoppingHost() means e.g. "shop.gap.com"
// counts as "gap.com" too.
const SHOPPING_HOSTS = new Set([
  // ── Marketplaces + department ──
  'amazon.com', 'amazon.co.uk', 'amazon.ca',
  'ebay.com', 'ebay.co.uk',
  'etsy.com',
  'bloomingdales.com',
  'macys.com',
  'neimanmarcus.com',
  'nordstrom.com',
  'nordstromrack.com',
  'saksfifthavenue.com',
  'saksoff5th.com',
  'target.com',
  'walmart.com',
  'zappos.com',
  'dsw.com',
  'footlocker.com',

  // ── Luxury + designer ──
  'balenciaga.com',
  'bergdorfgoodman.com',
  'bottegaveneta.com',
  'browns-fashion.com',
  'burberry.com',
  'celine.com',
  'chanel.com',
  'dior.com',
  'farfetch.com',
  'fendi.com',
  'givenchy.com',
  'gucci.com',
  'hermes.com',
  'loewe.com',
  'louisvuitton.com',
  'lvmh.com',
  'luisaviaroma.com',
  'matchesfashion.com',
  'mrporter.com',
  'mytheresa.com',
  'net-a-porter.com',
  'prada.com',
  'ssense.com',
  'theoutnet.com',
  'valentino.com',
  'versace.com',
  'yoox.com',
  '24s.com',

  // ── Contemporary + mid-market ──
  'allsaints.com',
  'acnestudios.com',
  'anthropologie.com',
  'apc-us.com',
  'aritzia.com',
  'banana-republic.com',
  'bananarepublic.com',
  'bananarepublic.gap.com',
  'cos.com',
  'everlane.com',
  'express.com',
  'freepeople.com',
  'gap.com',
  'jcrew.com',
  'madewell.com',
  'reformation.com', 'thereformation.com',
  'revolve.com',
  'shopbop.com',
  'theory.com',
  'toteme.com',
  'vince.com',

  // ── Fast fashion ──
  'asos.com',
  'boohoo.com',
  'fashionnova.com',
  'forever21.com',
  'hm.com',
  'hollisterco.com',
  'lulus.com',
  'missguided.com',
  'prettylittlething.com',
  'princesspolly.com',
  'princess-polly.com',
  'shein.com',
  'topshop.com',
  'uniqlo.com',
  'urbanoutfitters.com',
  'zalando.com',
  'zara.com',

  // ── Athletic + active ──
  'alo.com', 'aloyoga.com',
  'athleta.com',
  'gymshark.com',
  'lululemon.com',
  'nike.com',
  'outdoorvoices.com',
  'puma.com',
  'reebok.com',
  'underarmour.com',

  // ── American classic ──
  'abercrombie.com',
  'ae.com',
  'bestsecret.com',
  'kohls.com',
  'levi.com', 'levis.com',
  'oldnavy.gap.com',
  'polo.com', 'ralphlauren.com',
  'victoriassecret.com',

  // ── Outdoor + workwear ──
  'columbia.com',
  'filson.com',
  'patagonia.com',
  'rei.com',

  // ── Resale + secondhand ──
  'depop.com',
  'grailed.com',
  'mercari.com',
  'poshmark.com',
  'realreal.com', 'therealreal.com',
  'thredup.com',
  'vestiairecollective.com',
  'vinted.com',

  // ── Sneakers resale ──
  'goat.com',
  'stadiumgoods.com',
  'stockx.com',

  // ── Home (ignore for clothes queries but harmless) ──
  'marksandspencer.com',
  'wayfair.com',
  'westelm.com',
]);

/**
 * Hosts that produce noise for clothing-lookup results — video/social/blogs
 * rarely have the structured product data we need. Any match here is never
 * treated as a shopping result and gets dropped during refinement.
 */
const BLOCKED_HOSTS = new Set([
  // Video
  'youtube.com', 'youtu.be', 'youtube-nocookie.com',
  'vimeo.com',
  'dailymotion.com',
  'twitch.tv',
  'tiktok.com', 'vm.tiktok.com',
  // Social
  'instagram.com',
  'pinterest.com', 'pinterest.co.uk',
  'pinimg.com',
  'facebook.com', 'fb.com', 'fbsbx.com', 'fbcdn.net',
  'twitter.com', 'x.com', 't.co',
  'reddit.com', 'redd.it',
  'tumblr.com',
  'snapchat.com',
  'threads.net',
  'bsky.app',
  // Generic blogs / UGC
  'medium.com',
  'substack.com',
  'wikipedia.org', 'wikimedia.org',
  'quora.com',
  'blogspot.com',
  'wordpress.com',
  'squarespace.com',
  'wixsite.com',
  'weebly.com',
  'tripod.com',
  // News
  'nytimes.com', 'wsj.com', 'bbc.com', 'bbc.co.uk', 'cnn.com',
  'theguardian.com', 'huffpost.com', 'buzzfeed.com',
]);

const isBlockedHost = (host: string): boolean => {
  if (BLOCKED_HOSTS.has(host)) return true;
  for (const blocked of BLOCKED_HOSTS) {
    if (host.endsWith('.' + blocked)) return true;
  }
  return false;
};

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

/**
 * Segments that indicate a URL is a category/shelf page rather than a
 * specific product detail page. We aggressively filter these out because they
 * return generic titles like "Handbags Shop All" that never match a single
 * item the user is adding.
 */
const SHELF_URL_PATTERNS = [
  /\/shop\/([^/?]+\/?)?$/i,
  /\/shop\?/i,
  /\/c\//i,
  /\/category\//i,
  /\/categories\//i,
  /\/browse\//i,
  /\/collection\//i,
  /\/collections\/[^/?]+\/?$/i, // /collections/bags (shelf) but keep /collections/x/products/y
  /\/all-[a-z-]+/i,
  /\/gp\/browse/i,
  /\/s\?k=/i,
  /\/search\?/i,
];

const isShelfUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    return SHELF_URL_PATTERNS.some(re => re.test(path));
  } catch {
    return false;
  }
};

/**
 * Titles that indicate a shelf/search page rather than a product listing.
 */
const SHELF_TITLE_PATTERNS = [
  /shop all/i,
  /shop by/i,
  /^all [a-z]+/i,
  /browse/i,
  /category/i,
  /search results/i,
  /collection/i,
];

const isShelfTitle = (title: string): boolean =>
  SHELF_TITLE_PATTERNS.some(re => re.test(title));

/**
 * Score a lens result by how well its title/source matches the detected
 * attributes from the initial photo. Returns a 0..∞ score (higher = better).
 *
 * Much more effective than Vision's raw similarity score for our use case
 * because we're filtering out same-category-different-product noise.
 */
export const scoreLensResultByAttributes = (
  result: { title: string; source: string; similarity: number },
  attrs: {
    color?: string;
    subtype?: string;
    category?: string;
    material?: string;
    brand?: string;
  },
): number => {
  const t = result.title.toLowerCase();
  const s = result.source.toLowerCase();
  let score = result.similarity * 2; // base from Vision

  // Strong signal: specific detected color appears in title
  if (attrs.color && t.includes(attrs.color.toLowerCase())) score += 5;
  // Related color synonyms get a smaller boost
  const colorSynonyms: Record<string, string[]> = {
    burgundy: ['maroon', 'wine', 'oxblood', 'merlot', 'dark red'],
    maroon: ['burgundy', 'wine', 'oxblood'],
    wine: ['burgundy', 'maroon', 'merlot'],
    navy: ['dark blue', 'midnight'],
    charcoal: ['dark gray', 'dark grey', 'graphite'],
    camel: ['tan', 'beige', 'caramel', 'nude'],
    champagne: ['cream', 'ivory', 'off-white', 'nude'],
    gray: ['grey'],
    grey: ['gray'],
  };
  if (attrs.color) {
    const syns = colorSynonyms[attrs.color.toLowerCase()] || [];
    if (syns.some(syn => t.includes(syn))) score += 3;
  }

  // Subtype match (handbag, sneaker, jeans...)
  if (attrs.subtype && t.includes(attrs.subtype.toLowerCase())) score += 4;

  // Category match (fallback if subtype not detected)
  if (attrs.category && t.includes(attrs.category.toLowerCase())) score += 2;

  // Material match
  if (attrs.material && t.includes(attrs.material.toLowerCase())) score += 2;

  // Brand match
  if (attrs.brand && (t.includes(attrs.brand.toLowerCase()) || s.includes(attrs.brand.toLowerCase()))) {
    score += 3;
  }

  // Heavy penalty for shelf titles we already try to filter — belt & braces
  if (isShelfTitle(result.title)) score -= 10;

  return score;
};

/**
 * Filter + rank lens results against detected attributes. Drops shelf pages,
 * dedupes by (title+source), then ranks by attribute-match score. Returns
 * only the top N that actually look like they could be the user's item.
 */
export const refineLensResults = (
  results: LensResult[],
  attrs: {
    color?: string;
    subtype?: string;
    category?: string;
    material?: string;
    brand?: string;
  },
  limit = 6,
): LensResult[] => {
  // ── Drop junk ──
  const cleaned = results.filter(r => {
    if (!/^https?:\/\//i.test(r.imageUrl || '')) return false;
    if (isBlockedHost(r.source)) return false;   // YouTube / Pinterest / blogs
    if (isShelfUrl(r.url)) return false;
    if (isShelfTitle(r.title)) return false;
    // Require a shopping host — after the block filter, this keeps ONLY real
    // retailers (clothes brands, marketplaces, resale). Lens results from
    // random one-off pages rarely have usable product data.
    if (!r.isShopping) return false;
    return true;
  });

  // ── De-dupe by (title + source) ──
  const seen = new Set<string>();
  const deduped: LensResult[] = [];
  for (const r of cleaned) {
    const key = `${r.title.trim().toLowerCase()}|${r.source.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  // ── Rank ──
  const scored = deduped
    .map(r => ({ r, s: scoreLensResultByAttributes(r, attrs) }))
    .sort((a, b) => b.s - a.s);

  // Require a minimum score so we don't return junk when nothing really matches
  const passing = scored.filter(x => x.s > 0);

  return passing.slice(0, limit).map(x => x.r);
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

    let data: any;
    try {
      data = await callAiProxy<any>('vision', {
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
      });
    } catch (err: any) {
      return {
        query: '',
        bestGuessLabels: [],
        results: [],
        error: `Vision proxy: ${err?.message?.substring(0, 120) ?? 'failed'}`,
      };
    }
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

    /** Only strings that look like http(s) URLs qualify as image URLs. */
    const isHttpUrl = (u: unknown): u is string =>
      typeof u === 'string' && /^https?:\/\//i.test(u);

    pages.forEach((p, idx) => {
      if (!p.url) return;
      const host = normalizeHost(p.url);
      if (!host || seen.has(p.url)) return;
      if (isBlockedHost(host)) return;
      seen.add(p.url);

      // Pick a thumbnail: matching full image > partial > similar image.
      // NOTE: never fall back to p.pageTitle here — it's a TITLE, not a URL,
      // and would be resolved against the bundle if passed to <Image>.
      const candidates = [
        p.fullMatchingImages?.[0]?.url,
        p.partialMatchingImages?.[0]?.url,
        similarImages[idx]?.url,
      ];
      const imageUrl = candidates.find(isHttpUrl) ?? '';

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
        const host = normalizeHost(img.url);
        if (isBlockedHost(host)) return;
        seen.add(img.url);
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
 * Score a curated-catalog entry against detected attributes — same signal
 * as scoreLensResultByAttributes but against our in-memory catalog rather
 * than live web results.
 */
export const rankCatalogByAttributes = (
  attrs: {
    color?: string;
    subtype?: string;
    category?: string;
    material?: string;
  },
  limit = 6,
): LensResult[] => {
  const tokens: string[] = [];
  if (attrs.color) tokens.push(attrs.color.toLowerCase());
  if (attrs.subtype) tokens.push(attrs.subtype.toLowerCase());
  if (attrs.category) tokens.push(attrs.category.toLowerCase());
  if (attrs.material) tokens.push(attrs.material.toLowerCase());

  if (tokens.length === 0) return [];

  const colorSynonyms: Record<string, string[]> = {
    burgundy: ['maroon', 'wine', 'oxblood'],
    maroon: ['burgundy', 'wine'],
    navy: ['dark blue'],
    camel: ['tan', 'caramel'],
    champagne: ['cream', 'ivory'],
  };

  const scored = FALLBACK_CATALOG.map(entry => {
    const hay = entry.title.toLowerCase();
    let s = 0;
    for (const tok of tokens) {
      if (hay.includes(tok)) s += 3;
      const syns = colorSynonyms[tok] || [];
      for (const syn of syns) if (hay.includes(syn)) s += 1.5;
    }
    return { entry, s };
  });

  return scored
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.entry);
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

  // ── Google Custom Search path (proxied) ──
  // CSE config now lives server-side in Supabase Secrets; clients only need
  // to be signed in to invoke the proxy.
  try {
    let data: any;
    try {
      data = await callAiProxy<any>('cse', {
        q: trimmed,
        searchType: 'image',
        num: '10',
        safe: 'active',
      });
    } catch (err: any) {
      // 503 from proxy means CSE not configured server-side — silently skip
      // and fall through to the curated catalog path below.
      console.log('[lens] CSE proxy unavailable:', err?.message?.substring(0, 80));
      data = null;
    }
    if (data) {
      const items: any[] = data.items || [];
        const results: LensResult[] = items
          .map((it, idx) => {
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
          })
        // Drop YouTube / Pinterest / blogs — we want actual shoppable items.
        .filter(r => !isBlockedHost(r.source));
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
  } catch (e: any) {
    console.warn('[lensSearchService] CSE fetch failed, using catalog:', e?.message);
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
