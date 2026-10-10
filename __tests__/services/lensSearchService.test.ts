/**
 * Photo / text product search: results are only what the web returned.
 * Image URLs are made loadable under App Transport Security (https only),
 * page links are http(s) only, and a failed or empty search never produces
 * invented products.
 */
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));
let mockVisionOn = true;
jest.mock('../../src/config/env', () => ({
  env: {
    SUPABASE_URL: 'https://example.supabase.co',
    ENABLE_REVERSE_IMAGE_SEARCH: true,
    GOOGLE_VISION_API_KEY: '',
    BRAVE_API_KEY: '',
  },
  hasGoogleVision: () => mockVisionOn,
}));
jest.mock('../../src/platform/fileSystem', () => ({
  readImageAsBase64: jest.fn(async () => 'base64-photo'),
}));
jest.mock('../../src/services/aiProxy', () => ({
  ...jest.requireActual('../../src/services/aiProxy'),
  callAiProxy: jest.fn(),
}));

import * as lens from '../../src/services/lensSearchService';
import { callAiProxy, AI_SEARCH_OFF_MESSAGE } from '../../src/services/aiProxy';
import { AI_CONSENT_ERROR } from '../../src/services/aiConsent';
import { readImageAsBase64 } from '../../src/platform/fileSystem';

const proxy = callAiProxy as jest.Mock;

beforeEach(() => {
  mockVisionOn = true;
  proxy.mockReset();
  (readImageAsBase64 as jest.Mock).mockResolvedValue('base64-photo');
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const DEV_TEXT = /ai-proxy|not_signed_in|\b[45]\d\d\b|openai|brave|json|undefined/i;

describe('toSecureImageUrl', () => {
  it('upgrades http to https and keeps https', () => {
    expect(lens.toSecureImageUrl('http://cdn.shop.com/a.jpg')).toBe('https://cdn.shop.com/a.jpg');
    expect(lens.toSecureImageUrl('HTTP://cdn.shop.com/a.jpg')).toBe('https://cdn.shop.com/a.jpg');
    expect(lens.toSecureImageUrl('https://cdn.shop.com/a.jpg')).toBe('https://cdn.shop.com/a.jpg');
    expect(lens.toSecureImageUrl('  http://cdn.shop.com/a.jpg?w=2&h=3 ')).toBe('https://cdn.shop.com/a.jpg?w=2&h=3');
  });

  it('drops non-http(s) schemes and junk', () => {
    for (const bad of [
      'data:image/png;base64,AAAA',
      'file:///var/mobile/a.jpg',
      'javascript:alert(1)',
      'ftp://cdn.shop.com/a.jpg',
      '//cdn.shop.com/a.jpg',
      'Blue linen shirt',
      'http://',
      '',
      undefined,
      null,
      42,
    ]) {
      expect(lens.toSecureImageUrl(bad)).toBe('');
    }
  });
});

describe('toWebUrl', () => {
  it('keeps http(s) page links exactly as given', () => {
    expect(lens.toWebUrl('http://shop.com/p/1')).toBe('http://shop.com/p/1');
    expect(lens.toWebUrl('https://shop.com/p/1?x=1')).toBe('https://shop.com/p/1?x=1');
  });

  it('rejects other schemes', () => {
    for (const bad of ['javascript:alert(1)', 'mailto:a@b.com', 'tel:123', 'ftp://shop.com/x', 'shop.com/x', undefined]) {
      expect(lens.toWebUrl(bad)).toBe('');
    }
  });
});

describe('searchByImage', () => {
  const visionResponse = (web: any, labels: string[] = []) => ({
    responses: [
      {
        labelAnnotations: labels.map(description => ({ description })),
        webDetection: web,
      },
    ],
  });

  it('upgrades http thumbnails to https and keeps https ones', async () => {
    proxy.mockResolvedValue(
      visionResponse({
        bestGuessLabels: [{ label: 'linen shirt' }],
        pagesWithMatchingImages: [
          {
            url: 'https://www.zara.com/us/en/linen-shirt-p1.html',
            pageTitle: 'Linen shirt',
            score: 0.9,
            fullMatchingImages: [{ url: 'http://static.zara.net/1.jpg' }],
          },
          {
            url: 'https://www.everlane.com/products/shirt',
            pageTitle: 'Shirt',
            score: 0.8,
            fullMatchingImages: [{ url: 'https://images.everlane.com/2.jpg' }],
          },
        ],
      }),
    );

    const res = await lens.searchByImage('file:///photo.jpg');

    expect(res.error).toBeUndefined();
    expect(res.query).toBe('linen shirt');
    expect(res.results.map(r => r.imageUrl).sort()).toEqual([
      'https://images.everlane.com/2.jpg',
      'https://static.zara.net/1.jpg',
    ]);
    for (const r of res.results) expect(r.imageUrl.startsWith('https://')).toBe(true);
  });

  it('skips thumbnail candidates that are not http(s) and falls back to the next', async () => {
    proxy.mockResolvedValue(
      visionResponse({
        pagesWithMatchingImages: [
          {
            url: 'https://www.zara.com/p1',
            pageTitle: 'Shirt',
            fullMatchingImages: [{ url: 'data:image/png;base64,AAAA' }],
            partialMatchingImages: [{ url: 'http://static.zara.net/partial.jpg' }],
          },
          {
            url: 'https://www.hm.com/p2',
            pageTitle: 'Tee',
            fullMatchingImages: [{ url: 'file:///etc/hosts' }],
          },
        ],
      }),
    );

    const res = await lens.searchByImage('file:///photo.jpg');
    const byHost = Object.fromEntries(res.results.map(r => [r.source, r.imageUrl]));
    expect(byHost['zara.com']).toBe('https://static.zara.net/partial.jpg');
    expect(byHost['hm.com']).toBe('');
  });

  it('only returns http(s) page links', async () => {
    proxy.mockResolvedValue(
      visionResponse({
        pagesWithMatchingImages: [
          { url: 'javascript:alert(1)', pageTitle: 'x' },
          { url: 'ftp://www.zara.com/file', pageTitle: 'y' },
          { url: 'mailto:a@zara.com', pageTitle: 'z' },
          { url: 'http://www.zara.com/p1', pageTitle: 'ok' },
        ],
        visuallySimilarImages: [{ url: 'ftp://cdn.zara.net/s.jpg' }, { url: 'http://cdn.zara.net/s2.jpg', score: 0.6 }],
      }),
    );

    const res = await lens.searchByImage('file:///photo.jpg');

    expect(res.results.length).toBeGreaterThan(0);
    for (const r of res.results) {
      expect(r.url).toMatch(/^https?:\/\//);
      expect(r.imageUrl === '' || r.imageUrl.startsWith('https://')).toBe(true);
    }
    // page links stay as given (not rewritten); a bare similar image is a picture, not a result
    expect(res.results.find(r => r.title === 'ok')?.url).toBe('http://www.zara.com/p1');
    expect(res.results.some(r => r.id.startsWith('sim-'))).toBe(false);
    expect(res.results.some(r => r.url.endsWith('.jpg'))).toBe(false);
  });

  it('returns an empty list, not invented products, when the web has nothing', async () => {
    proxy.mockResolvedValue(visionResponse({}, ['Clothing']));

    const res = await lens.searchByImage('file:///photo.jpg');

    expect(res.results).toEqual([]);
    expect(res.error).toBeUndefined();
    expect(res.notConfigured).toBeUndefined();
  });

  it('survives a response with no responses at all', async () => {
    proxy.mockResolvedValue({});
    const res = await lens.searchByImage('file:///photo.jpg');
    expect(res.results).toEqual([]);
    expect(res.error).toBeUndefined();
  });

  it.each([
    ['guest', new Error('not_signed_in: ai-proxy requires an authenticated user'), 'Sign in to search for matches.'],
    ['consent off', new Error(AI_CONSENT_ERROR), AI_SEARCH_OFF_MESSAGE],
    ['proxy 401', new Error('ai-proxy vision 401: {"error":"jwt expired"}'), 'Sign in to search for matches.'],
    ['proxy 500', new Error('ai-proxy vision 500: {"error":"boom"}'), "Couldn't search right now. Check your connection and try again."],
    ['offline', new TypeError('Network request failed'), "Couldn't search right now. Check your connection and try again."],
  ])('fails friendly with no results (%s)', async (_name, err, message) => {
    proxy.mockRejectedValue(err);

    const res = await lens.searchByImage('file:///photo.jpg');

    expect(res.results).toEqual([]);
    expect(res.error).toBe(message);
    expect(res.error).not.toMatch(DEV_TEXT);
  });

  it('fails friendly when the photo cannot be read', async () => {
    (readImageAsBase64 as jest.Mock).mockRejectedValue(new Error('ENOENT: /var/mobile/Containers/x.jpg'));

    const res = await lens.searchByImage('file:///gone.jpg');

    expect(res.results).toEqual([]);
    expect(res.error).toBe("Couldn't search right now. Check your connection and try again.");
    expect(proxy).not.toHaveBeenCalled();
  });

  it('reports not configured without calling the proxy', async () => {
    mockVisionOn = false;
    const res = await lens.searchByImage('file:///photo.jpg');
    expect(res).toMatchObject({ notConfigured: true, results: [] });
    expect(proxy).not.toHaveBeenCalled();
  });
});

describe('searchProductsByText', () => {
  it('maps real web results: thumbnail first, http upgraded, blocked hosts and bad links dropped', async () => {
    proxy.mockResolvedValue({
      results: [
        {
          title: 'Burgundy clutch',
          url: 'https://www.net-a-porter.com/clutch',
          thumbnail: { src: 'https://imgs.search.brave.com/t1' },
          properties: { url: 'http://img.net-a-porter.com/full.jpg' },
        },
        {
          title: 'Old shop',
          url: 'http://www.zara.com/old',
          thumbnail: { src: 'data:image/png;base64,AAAA' },
          properties: { url: 'http://img.zara.com/full.jpg' },
        },
        { title: 'Video', url: 'https://www.youtube.com/watch?v=1', thumbnail: { src: 'https://i.ytimg.com/x.jpg' } },
        { title: 'Script', url: 'javascript:alert(1)', thumbnail: { src: 'https://imgs.search.brave.com/t2' } },
        { title: 'No link', thumbnail: { src: 'https://imgs.search.brave.com/t3' } },
        { title: 'No image', url: 'https://www.hm.com/p' },
      ],
    });

    const res = await lens.searchProductsByText('  burgundy clutch ');

    // Resale hosts are excluded at the source and plenty of results are asked for, since many get filtered.
    expect(proxy).toHaveBeenCalledWith(
      'brave',
      expect.objectContaining({ q: expect.stringMatching(/^burgundy clutch -site:ebay\.com /), num: 50, safe: 'active' }),
    );
    expect(res.error).toBeUndefined();
    const byTitle = Object.fromEntries(res.results.map(r => [r.title, r]));
    expect(Object.keys(byTitle).sort()).toEqual(['Burgundy clutch', 'No image', 'Old shop']);
    expect(byTitle['Burgundy clutch'].imageUrl).toBe('https://imgs.search.brave.com/t1');
    expect(byTitle['Old shop'].imageUrl).toBe('https://img.zara.com/full.jpg');
    expect(byTitle['Old shop'].url).toBe('http://www.zara.com/old');
    expect(byTitle['No image'].imageUrl).toBe('');
    expect(res.results.every(r => r.isShopping)).toBe(true);
  });

  it('returns nothing when the search finds nothing', async () => {
    proxy.mockResolvedValue({ results: [] });
    expect(await lens.searchProductsByText('qwertyuiop')).toMatchObject({ results: [] });
    proxy.mockResolvedValue({});
    expect((await lens.searchProductsByText('qwertyuiop')).results).toEqual([]);
  });

  it.each([
    ['guest', new Error('not_signed_in: ai-proxy requires an authenticated user'), 'Sign in to search for matches.'],
    ['rate limited', new Error('ai-proxy brave 429: {"error":"rate limit"}'), "Couldn't search right now. Check your connection and try again."],
    ['not configured', new Error('ai-proxy brave 503: {"error":"BRAVE_API_KEY not set"}'), "Couldn't search right now. Check your connection and try again."],
    ['offline', new TypeError('Network request failed'), "Couldn't search right now. Check your connection and try again."],
  ])('never substitutes products when the search fails (%s)', async (_name, err, message) => {
    proxy.mockRejectedValue(err);

    const res = await lens.searchProductsByText('white sneakers');

    expect(res.results).toEqual([]);
    expect(res.error).toBe(message);
    expect(res.error).not.toMatch(DEV_TEXT);
  });

  it('does not call the proxy for a blank query', async () => {
    expect(await lens.searchProductsByText('   ')).toEqual({ query: '', bestGuessLabels: [], results: [] });
    expect(proxy).not.toHaveBeenCalled();
  });
});

describe('no invented catalog', () => {
  it('no longer ships a fallback catalog or catalog ranking', () => {
    expect((lens as any).rankCatalogByAttributes).toBeUndefined();
    expect((lens as any).FALLBACK_CATALOG).toBeUndefined();
  });
});

describe('refineLensResults (unchanged behaviour)', () => {
  // Each result has its own picture: the same picture twice is one product.
  const r = (over: Partial<lens.LensResult>): lens.LensResult => ({
    id: 'x',
    title: 'Burgundy leather clutch',
    source: 'net-a-porter.com',
    url: 'https://www.net-a-porter.com/clutch-1',
    imageUrl: `https://img.example.com/${over.id ?? 'x'}.jpg`,
    similarity: 0.5,
    isShopping: true,
    ...over,
  });

  it('drops shelf pages, non-shopping hosts and results without a usable image, and ranks by attribute match', () => {
    const out = lens.refineLensResults(
      [
        r({ id: 'ok-plain', title: 'Leather clutch', url: 'https://www.net-a-porter.com/clutch-2' }),
        r({ id: 'ok-best' }),
        r({ id: 'shelf-url', url: 'https://www.net-a-porter.com/shop/clutches/' }),
        r({ id: 'shelf-title', title: 'Shop all clutches' }),
        r({ id: 'blog', source: 'medium.com', url: 'https://medium.com/p', isShopping: false }),
        r({ id: 'no-image', imageUrl: '', url: 'https://www.net-a-porter.com/clutch-3' }),
      ],
      { color: 'burgundy', subtype: 'clutch' },
    );

    expect(out.map(x => x.id)).toEqual(['ok-best', 'ok-plain']);
  });
});
