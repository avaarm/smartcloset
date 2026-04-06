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
