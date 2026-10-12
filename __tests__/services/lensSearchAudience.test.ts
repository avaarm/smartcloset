/**
 * Search that knows who the wardrobe is for, end to end through lensSearchService with the
 * network and the saved answer mocked: a women's (or men's) wardrobe asks the web for "womens"
 * ("mens"), loses the listings that clearly name the other gender, and sees the ones that name
 * its own first within each kind of shop. "Both", no answer, or an answer that cannot be read
 * leave the search exactly as it was.
 */
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));
jest.mock('../../src/config/env', () => ({
  env: {
    SUPABASE_URL: 'https://example.supabase.co',
    ENABLE_REVERSE_IMAGE_SEARCH: true,
    GOOGLE_VISION_API_KEY: '',
    BRAVE_API_KEY: '',
  },
  hasGoogleVision: () => true,
}));
jest.mock('../../src/platform/fileSystem', () => ({
  readImageAsBase64: jest.fn(async () => 'base64-photo'),
}));
jest.mock('../../src/services/aiProxy', () => ({
  ...jest.requireActual('../../src/services/aiProxy'),
  callAiProxy: jest.fn(),
}));
jest.mock('../../src/services/wardrobeAudience', () => ({
  getWardrobeFor: jest.fn(),
}));

import * as lens from '../../src/services/lensSearchService';
import { callAiProxy } from '../../src/services/aiProxy';
import { getWardrobeFor } from '../../src/services/wardrobeAudience';
import { BRAVE_QUERY_MAX } from '../../src/services/searchRanking';

const proxy = callAiProxy as jest.Mock;
const wardrobe = getWardrobeFor as jest.Mock;

let warn: jest.SpyInstance;
beforeEach(() => {
  proxy.mockReset();
  wardrobe.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

/** One Brave image-search result. */
const hit = (n: number | string, host: string, path: string, title: string) => ({
  title,
  url: `https://www.${host}${path}`,
  thumbnail: { src: `https://imgs.search.brave.com/t/${host}-${n}` },
});

const braveCalls = () => proxy.mock.calls.filter(c => c[0] === 'brave').map(c => c[1] as { q: string });
const braveQueries = () => braveCalls().map(c => c.q);
const titles = (res: lens.LensSearchResponse) => res.results.map(r => r.title);

// Brave's order: the men's boot first, then one that does not say, then the women's.
const MENS = hit(1, 'nordstrom.com', '/s/suede-ankle-boot/1001', "Men's Suede Ankle Boot | Nordstrom");
const UNMARKED = hit(2, 'zara.com', '/us/en/suede-ankle-boots-p2.html', 'Suede ankle boots - Zara United States');
const WOMENS = hit(3, 'nordstrom.com', '/s/suede-ankle-boot/1003', "Women's Suede Ankle Boot | Nordstrom");
const BRAVE_ORDER = [MENS, UNMARKED, WOMENS];

describe('text search for a women\'s wardrobe', () => {
  beforeEach(() => wardrobe.mockResolvedValue('women'));

  it('asks for "womens", drops the men\'s listing and keeps the unmarked and the women\'s', async () => {
    proxy.mockResolvedValue({ results: BRAVE_ORDER });

    const res = await lens.searchProductsByText('ankle boots');

    expect(res.error).toBeUndefined();
    const [first] = braveCalls();
    expect(first.q.startsWith('ankle boots womens -site:ebay.com -site:poshmark.com')).toBe(true);
    expect(first.q.length).toBeLessThanOrEqual(BRAVE_QUERY_MAX);
    expect(titles(res)).toHaveLength(2);
    expect(titles(res)).toEqual(expect.arrayContaining(['Suede ankle boots', "Women's Suede Ankle Boot"]));
    expect(titles(res).some(t => /^men/i.test(t))).toBe(false);
  });

  it('puts the listing that names its gender ahead of the unmarked one in the same kind of shop', async () => {
    proxy.mockResolvedValue({ results: BRAVE_ORDER });

    const res = await lens.searchProductsByText('ankle boots');

    // Brave had the unmarked one first; the women's boot is lifted over it.
    expect(BRAVE_ORDER.indexOf(UNMARKED)).toBeLessThan(BRAVE_ORDER.indexOf(WOMENS));
    expect(titles(res)).toEqual(["Women's Suede Ankle Boot", 'Suede ankle boots']);
  });

  it('reads the saved answer once for the search, retry included', async () => {
    // Two shop results: too few, so the search asks again without the exclusions.
    proxy.mockResolvedValue({ results: BRAVE_ORDER });

    await lens.searchProductsByText('ankle boots');

    expect(braveCalls().length).toBeGreaterThanOrEqual(2);
    expect(wardrobe).toHaveBeenCalledTimes(1);
    for (const q of braveQueries()) {
      expect(q.split(' ').filter(w => w === 'womens')).toHaveLength(1);
    }
  });

  it('drops a listing whose link names men when its title does not', async () => {
    proxy.mockResolvedValue({
      results: [
        hit(1, 'nike.com', '/t/ankle-boot-mens-shoes-abc123/DM0029-100', 'Ankle boot'),
        hit(2, 'nike.com', '/t/ankle-boot-womens-shoes-abc123/DM0029-101', 'Ankle boot'),
        hit(3, 'hm.com', '/en_us/men/ankle-boots/1', 'Ankle boot'),
        hit(4, 'asos.com', '/us/asos-design/asos-design-ankle-boot/prd/204567', 'ASOS DESIGN ankle boot'),
      ],
    });

    const res = await lens.searchProductsByText('ankle boots');

    expect(res.results.map(r => r.url)).toEqual([
      'https://www.nike.com/t/ankle-boot-womens-shoes-abc123/DM0029-101',
      'https://www.asos.com/us/asos-design/asos-design-ankle-boot/prd/204567',
    ]);
  });

  it('keeps retail ahead of resale: a women\'s resale listing does not pass an unmarked shop', async () => {
    proxy.mockResolvedValue({
      results: [
        hit(1, 'ebay.com', '/itm/1', "Women's suede ankle boots size 8 | eBay"),
        hit(2, 'poshmark.com', '/listing/Womens-Suede-Ankle-Boots-1abc', "Women's Suede Ankle Boots Poshmark"),
        UNMARKED,
      ],
    });

    const res = await lens.searchProductsByText('ankle boots', { includeResale: true });

    expect(res.results.map(r => r.sourceKind)).toEqual(['retail', 'resale', 'resale']);
    expect(res.results[0].source).toBe('zara.com');
  });

  it('lets the search words lead: a name-less listing that matches them beats a women\'s one that barely does', async () => {
    proxy.mockResolvedValue({
      results: [
        hit(1, 'zara.com', '/us/en/tan-suede-ankle-boots-p1.html', 'Tan suede ankle boots'),
        hit(2, 'nordstrom.com', '/s/ankle-boot/1002', "Women's Ankle Boot | Nordstrom"),
      ],
    });

    const res = await lens.searchProductsByText('tan suede ankle boots');

    expect(titles(res)).toEqual(['Tan suede ankle boots', "Women's Ankle Boot"]);
  });

  it('does not add the word when the person typed a gender, and keeps what they asked for', async () => {
    proxy.mockResolvedValue({ results: BRAVE_ORDER });

    const res = await lens.searchProductsByText("men's ankle boots");

    expect(braveQueries()[0].startsWith("men's ankle boots -site:ebay.com")).toBe(true);
    for (const q of braveQueries()) expect(q).not.toMatch(/\bwomens\b/);
    // The men's boot is what they asked for.
    expect(titles(res)).toContain("Men's Suede Ankle Boot");
  });

  it('does not narrow a children\'s search', async () => {
    const toddler = hit(1, 'nordstrom.com', '/s/chelsea-boot/8888', "Toddler Boys' Brown Chelsea Boot | Nordstrom");
    proxy.mockResolvedValue({ results: [toddler, WOMENS] });

    const typed = await lens.searchProductsByText('toddler chelsea boot');
    expect(braveQueries()[0]).not.toMatch(/\bwomens\b/);
    expect(titles(typed)).toEqual(["Toddler Boys' Brown Chelsea Boot"]);

    proxy.mockClear();
    const asked = await lens.searchProductsByText('chelsea boot', { audience: 'kids' });
    expect(braveQueries()[0]).not.toMatch(/\bwomens\b/);
    expect(titles(asked)).toEqual(["Toddler Boys' Brown Chelsea Boot"]);
  });

  it('adds the word after the category noun a short search gets', async () => {
    proxy.mockResolvedValue({ results: [] });
    await lens.searchProductsByText('bottega', { category: 'bags', includeResale: true });
    expect(braveQueries()[0]).toBe('bottega bag womens');
  });
});

describe('text search for a men\'s wardrobe', () => {
  beforeEach(() => wardrobe.mockResolvedValue('men'));

  it('asks for "mens", drops the women\'s listing and puts the men\'s one first', async () => {
    proxy.mockResolvedValue({ results: [WOMENS, UNMARKED, MENS] });

    const res = await lens.searchProductsByText('ankle boots');

    expect(braveQueries()[0].startsWith('ankle boots mens -site:ebay.com')).toBe(true);
    expect(braveQueries()[0]).not.toMatch(/womens/);
    expect(titles(res)).toEqual(["Men's Suede Ankle Boot", 'Suede ankle boots']);
  });
});

describe('text search with no gender to go on', () => {
  const plain = async (): Promise<lens.LensSearchResponse> => {
    proxy.mockResolvedValue({ results: BRAVE_ORDER });
    return lens.searchProductsByText('ankle boots');
  };

  it.each([
    ['no answer', null],
    ['both', 'both'],
    ['nothing came back', undefined],
  ])('sends the query exactly as before and keeps everything (%s)', async (_name, answer) => {
    wardrobe.mockResolvedValue(answer);

    const res = await plain();

    for (const q of braveQueries()) expect(q).not.toMatch(/\b(?:womens|mens)\b/);
    expect(braveQueries()[0].startsWith('ankle boots -site:ebay.com -site:poshmark.com')).toBe(true);
    // Nothing dropped, Brave's order kept.
    expect(titles(res)).toEqual(["Men's Suede Ankle Boot", 'Suede ankle boots', "Women's Suede Ankle Boot"]);
  });

  it('is the same query a search with no wardrobe at all would send', async () => {
    wardrobe.mockResolvedValue(null);
    await plain();
    const withNull = braveQueries();

    proxy.mockClear();
    wardrobe.mockResolvedValue('both');
    await plain();
    expect(braveQueries()).toEqual(withNull);
    expect(withNull[0]).toBe(
      ['ankle boots', ...withNull[0].split(' ').filter(w => w.startsWith('-site:'))].join(' '),
    );
  });

  it('is not broken by a saved answer that cannot be read', async () => {
    wardrobe.mockRejectedValue(new Error('AsyncStorage failed'));
    const res = await plain();
    expect(res.error).toBeUndefined();
    expect(titles(res)).toEqual(["Men's Suede Ankle Boot", 'Suede ankle boots', "Women's Suede Ankle Boot"]);
    for (const q of braveQueries()) expect(q).not.toMatch(/\b(?:womens|mens)\b/);
    expect(warn).toHaveBeenCalled();

    proxy.mockClear();
    wardrobe.mockImplementation(() => {
      throw new Error('synchronous failure');
    });
    const again = await plain();
    expect(again.error).toBeUndefined();
    expect(titles(again)).toHaveLength(3);
  });
});

describe('an explicit shopFor wins over the saved answer', () => {
  it('uses it without reading the wardrobe', async () => {
    wardrobe.mockResolvedValue('women');
    proxy.mockResolvedValue({ results: BRAVE_ORDER });

    const res = await lens.searchProductsByText('ankle boots', { shopFor: 'men' });

    expect(wardrobe).not.toHaveBeenCalled();
    expect(braveQueries()[0].startsWith('ankle boots mens -site:')).toBe(true);
    expect(titles(res)).toEqual(["Men's Suede Ankle Boot", 'Suede ankle boots']);
  });

  it.each([null, 'both'] as const)('%s means unnarrowed, whatever the wardrobe says', async shopFor => {
    wardrobe.mockResolvedValue('women');
    proxy.mockResolvedValue({ results: BRAVE_ORDER });

    const res = await lens.searchProductsByText('ankle boots', { shopFor });

    expect(wardrobe).not.toHaveBeenCalled();
    expect(braveQueries()[0].startsWith('ankle boots -site:')).toBe(true);
    expect(titles(res)).toHaveLength(3);
  });

  it('does not read the wardrobe for a blank search', async () => {
    wardrobe.mockResolvedValue('women');
    await lens.searchProductsByText('   ');
    await lens.searchProductsByText('--- :::');
    expect(wardrobe).not.toHaveBeenCalled();
    expect(proxy).not.toHaveBeenCalled();
  });
});

describe('photo search', () => {
  const vision = (web: any, labels: string[] = []) => ({
    responses: [{ labelAnnotations: labels.map(description => ({ description })), webDetection: web }],
  });
  /** Vision answers with `web`; the text search that follows is answered with `brave`. */
  const visionThenBrave = (web: any, brave: any[], labels: string[] = []) =>
    proxy.mockImplementation(async (provider: string) =>
      provider === 'vision' ? vision(web, labels) : { results: brave },
    );
  const page = (host: string, path: string, pageTitle: string, score = 0.8) => ({
    url: `https://www.${host}${path}`,
    pageTitle,
    score,
    fullMatchingImages: [{ url: `https://img.${host}/${path.replace(/\W+/g, '-')}.jpg` }],
  });
  const hints = { color: 'tan', subtype: 'ankle boots', category: 'shoes' };
  const NO_PAGES = { pagesWithMatchingImages: [] };

  it('carries the wardrobe into the text search that follows, reading it once', async () => {
    wardrobe.mockResolvedValue('women');
    visionThenBrave(NO_PAGES, [MENS, UNMARKED, WOMENS]);

    const res = await lens.searchByImage('file:///boots.jpg', hints);

    expect(res.query).toBe('tan ankle boots');
    expect(braveQueries()[0].startsWith('tan ankle boots womens -site:')).toBe(true);
    expect(wardrobe).toHaveBeenCalledTimes(1);
    expect(titles(res)).toEqual(["Women's Suede Ankle Boot", 'Suede ankle boots']);
  });

  it('drops a matching page for the other gender and prefers the one that names its own', async () => {
    wardrobe.mockResolvedValue('men');
    visionThenBrave(
      {
        pagesWithMatchingImages: [
          page('nordstrom.com', '/s/ankle-boot/1001', "Women's Suede Ankle Boot | Nordstrom", 0.9),
          page('zara.com', '/us/en/ankle-boots-p2.html', 'Ankle boots - Zara United States', 0.85),
          page('nordstrom.com', '/s/ankle-boot/1003', "Men's Suede Ankle Boot | Nordstrom", 0.8),
        ],
      },
      [],
    );

    const res = await lens.searchByImage('file:///boots.jpg', hints);

    expect(titles(res)).toEqual(["Men's Suede Ankle Boot", 'Ankle boots']);
  });

  it('uses an explicit hint instead of the wardrobe', async () => {
    wardrobe.mockResolvedValue('women');
    visionThenBrave(NO_PAGES, [WOMENS, UNMARKED, MENS]);

    const res = await lens.searchByImage('file:///boots.jpg', { ...hints, shopFor: 'men' });

    expect(wardrobe).not.toHaveBeenCalled();
    expect(braveQueries()[0].startsWith('tan ankle boots mens -site:')).toBe(true);
    expect(titles(res)).toEqual(["Men's Suede Ankle Boot", 'Suede ankle boots']);
  });

  it.each([null, 'both'] as const)('does not narrow for a %s hint, whatever the wardrobe says', async shopFor => {
    wardrobe.mockResolvedValue('women');
    visionThenBrave(NO_PAGES, [MENS, UNMARKED, WOMENS]);

    const res = await lens.searchByImage('file:///boots.jpg', { ...hints, shopFor });

    expect(wardrobe).not.toHaveBeenCalled();
    expect(braveQueries()[0].startsWith('tan ankle boots -site:')).toBe(true);
    expect(titles(res)).toHaveLength(3);
  });

  it.each([
    ['no answer', null],
    ['both', 'both'],
  ])('sends the same query as before for %s', async (_name, answer) => {
    wardrobe.mockResolvedValue(answer);
    visionThenBrave(NO_PAGES, [MENS, UNMARKED, WOMENS]);

    const res = await lens.searchByImage('file:///boots.jpg', hints);

    expect(braveQueries()[0].startsWith('tan ankle boots -site:ebay.com')).toBe(true);
    for (const q of braveQueries()) expect(q).not.toMatch(/\b(?:womens|mens)\b/);
    expect(titles(res)).toEqual(["Men's Suede Ankle Boot", 'Suede ankle boots', "Women's Suede Ankle Boot"]);
  });

  it('is not broken by a saved answer that cannot be read', async () => {
    wardrobe.mockRejectedValue(new Error('AsyncStorage failed'));
    visionThenBrave(NO_PAGES, [MENS, UNMARKED, WOMENS]);

    const res = await lens.searchByImage('file:///boots.jpg', hints);

    expect(res.error).toBeUndefined();
    expect(titles(res)).toHaveLength(3);
    for (const q of braveQueries()) expect(q).not.toMatch(/\b(?:womens|mens)\b/);
  });

  it('does not narrow a children\'s item', async () => {
    wardrobe.mockResolvedValue('women');
    const toddler = hit(1, 'nordstrom.com', '/s/chelsea-boot/8888', "Toddler Boys' Brown Chelsea Boot | Nordstrom");
    visionThenBrave(NO_PAGES, [toddler, WOMENS]);

    const res = await lens.searchByImage('file:///boots.jpg', { subtype: 'boots', category: 'shoes', audience: 'kids' });

    expect(braveQueries()[0]).not.toMatch(/\bwomens\b/);
    expect(titles(res)).toEqual(["Toddler Boys' Brown Chelsea Boot"]);
  });
});

describe('refineLensResults with shopFor (the "Is it one of these?" list)', () => {
  const r = (id: string, title: string, url: string, similarity = 0.5): lens.LensResult => ({
    id,
    title,
    source: 'nordstrom.com',
    url,
    imageUrl: `https://img.example.com/${id}.jpg`,
    similarity,
    isShopping: true,
  });
  const list = [
    r('men', "Men's Ankle Boot", 'https://www.nordstrom.com/s/ankle-boot/1001', 0.6),
    r('plain', 'Ankle Boot', 'https://www.nordstrom.com/s/ankle-boot/1002', 0.6),
    r('women', "Women's Ankle Boot", 'https://www.nordstrom.com/s/ankle-boot/1003', 0.6),
  ];

  it('drops the other gender and puts the one that names its own first', () => {
    const out = lens.refineLensResults(list, { subtype: 'ankle boots', shopFor: 'women' });
    expect(out.map(x => x.id)).toEqual(['women', 'plain']);
  });

  it('works for men, and from the link alone', () => {
    const out = lens.refineLensResults(
      [
        r('w', 'Ankle Boot', 'https://www.nike.com/t/ankle-boot-womens-shoes-abc/1'),
        r('u', 'Ankle Boot 2', 'https://www.nordstrom.com/s/ankle-boot/1002'),
        r('m', 'Ankle Boot 3', 'https://www.nike.com/t/ankle-boot-mens-shoes-abc/2'),
      ],
      { subtype: 'ankle boots', shopFor: 'men' },
    );
    expect(out.map(x => x.id)).toEqual(['m', 'u']);
  });

  it.each([undefined, null, 'both'] as const)('changes nothing for %s', shopFor => {
    const out = lens.refineLensResults(list, { subtype: 'ankle boots', shopFor });
    expect(out.map(x => x.id)).toEqual(lens.refineLensResults(list, { subtype: 'ankle boots' }).map(x => x.id));
    expect(out.map(x => x.id).sort()).toEqual(['men', 'plain', 'women']);
  });

  it('does not make a poor match good: the boost is only a nudge', () => {
    const out = lens.refineLensResults(
      [
        r('ok', 'Tan Suede Ankle Boot', 'https://www.nordstrom.com/s/ankle-boot/1002', 0.6),
        r('named', "Women's Boot", 'https://www.nordstrom.com/s/ankle-boot/1003', 0.6),
      ],
      { subtype: 'tan suede ankle boots', color: 'tan', shopFor: 'women' },
    );
    expect(out.map(x => x.id)).toEqual(['ok', 'named']);
  });
});
