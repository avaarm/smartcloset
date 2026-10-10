/**
 * Retail-first product search, end to end through lensSearchService with the
 * network mocked: a mixed set of results comes back shops first, children's
 * items are gone for an adult search, resale is demoted (or dropped once there
 * are enough shops), and the query sent to Brave is built, bounded and retried
 * as designed.
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

import * as lens from '../../src/services/lensSearchService';
import { callAiProxy } from '../../src/services/aiProxy';
import { BRAVE_QUERY_MAX, COMPACT_QUERY_MAX } from '../../src/services/searchRanking';
import { CLOTHING_COLORS } from '../../src/utils/colorNames';

const proxy = callAiProxy as jest.Mock;

beforeEach(() => {
  proxy.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

/** One Brave image-search result. */
const hit = (n: number | string, host: string, path: string, title: string) => ({
  title,
  url: `https://www.${host}${path}`,
  thumbnail: { src: `https://imgs.search.brave.com/t/${host}-${n}` },
});

const EBAY = [1, 2, 3, 4].map(n =>
  hit(n, 'ebay.com', `/itm/10${n}`, `Tan suede knee high boots womens size ${6 + n} | eBay`),
);
const POSH = [1, 2].map(n =>
  hit(n, 'poshmark.com', `/listing/Tan-Suede-Boots-${n}abc`, `Tan Suede Boots Size ${7 + n} Poshmark`),
);
const NORDSTROM = hit(1, 'nordstrom.com', '/s/suede-knee-high-boot/7777', "Women's Suede Knee High Boot | Nordstrom");
const ZARA = hit(1, 'zara.com', '/us/en/suede-high-heel-boots-p12345.html', 'Suede high heel boots - Zara United States');
const TODDLER = hit(1, 'nordstrom.com', '/s/chelsea-boot/8888', "Toddler Boys' Brown Chelsea Boot | Nordstrom");

/** Brave rank is what the screenshots showed: second-hand listings first. */
const MIXED = [...EBAY, ...POSH, TODDLER, NORDSTROM, ZARA];

const idsOf = (res: lens.LensSearchResponse) => res.results.map(r => `${r.source}`);

describe('text search: retail first, resale last, children\'s removed', () => {
  it('orders a mixed set retail first and drops the toddler boot for an adult search', async () => {
    proxy.mockResolvedValue({ results: MIXED });

    const res = await lens.searchProductsByText('tan suede knee high boots');

    expect(res.error).toBeUndefined();
    // Retail first (best title match first), then every resale listing, none lost.
    const hosts = idsOf(res);
    expect(hosts.slice(0, 2).sort()).toEqual(['nordstrom.com', 'zara.com']);
    expect(hosts.slice(2).every(h => h === 'ebay.com' || h === 'poshmark.com')).toBe(true);
    expect(hosts.filter(h => h === 'ebay.com')).toHaveLength(4);
    expect(hosts.filter(h => h === 'poshmark.com')).toHaveLength(2);
    // The toddler boot is on a retail site, so only the children's filter can have removed it.
    expect(res.results.some(r => /toddler/i.test(r.title))).toBe(false);
    expect(res.results.some(r => r.url.includes('/8888'))).toBe(false);
    // Cards are labelled.
    expect(res.results[0].sourceKind).toBe('retail');
    expect(res.results[res.results.length - 1].sourceKind).toBe('resale');
  });

  it('would have shown the toddler boot (and eBay first) without the new rules', async () => {
    // Guard on the fixture: in raw Brave order the first result is eBay and the toddler boot is present.
    expect(MIXED[0].url).toContain('ebay.com');
    expect(MIXED.some(m => /toddler/i.test(m.title))).toBe(true);
  });

  it('drops resale entirely once there are six shop results, unless "Include resale" is on', async () => {
    const shops = Array.from({ length: 6 }, (_, n) =>
      hit(n, 'zara.com', `/us/en/suede-boots-${n}-p${n}.html`, `Suede knee high boots style ${n}`),
    );
    proxy.mockResolvedValue({ results: [...EBAY, ...POSH, ...shops] });

    const hidden = await lens.searchProductsByText('suede knee high boots');
    expect(hidden.results).toHaveLength(6);
    expect(hidden.results.every(r => r.sourceKind === 'retail')).toBe(true);

    const shown = await lens.searchProductsByText('suede knee high boots', { includeResale: true });
    expect(shown.results).toHaveLength(12);
    expect(shown.results.slice(0, 6).every(r => r.sourceKind === 'retail')).toBe(true);
    expect(shown.results.slice(6).every(r => r.sourceKind === 'resale')).toBe(true);
  });

  it('counts sites it does not know as shops, and ranks them after retail but before resale', async () => {
    const boutiques = Array.from({ length: 4 }, (_, n) =>
      hit(n, `boutique${n}.example`, `/products/suede-boots-${n}`, `Suede knee high boots ${n}`),
    );
    proxy.mockResolvedValue({ results: [...EBAY, ...boutiques, NORDSTROM, ZARA] });

    const res = await lens.searchProductsByText('suede knee high boots');

    // 2 retail + 4 unknown = 6 shop results, so resale is dropped.
    expect(res.results.map(r => r.sourceKind)).toEqual([
      'retail', 'retail', 'unknown', 'unknown', 'unknown', 'unknown',
    ]);
  });

  it('treats a host that is the brand searched for as a shop', async () => {
    proxy.mockResolvedValue({
      results: [
        hit(1, 'ebay.com', '/itm/1', 'Bottega Veneta Andiamo large shopper bag brown'),
        hit(1, 'bottegaveneta.com', '/us/en/andiamo-large-bag-p1.html', 'Andiamo Large shopper bag brown'),
        hit(1, 'tinyleatherstudio.com', '/products/andiamo-bag', 'Andiamo bag'),
      ],
    });

    const res = await lens.searchProductsByText('bottega veneta andiamo bag');

    expect(res.results[0].source).toBe('bottegaveneta.com');
    expect(res.results[0].sourceKind).toBe('retail');
    expect(res.results[res.results.length - 1].source).toBe('ebay.com');
  });

  it('removes category pages, blog posts and sneakers from a boot search, and repeats', async () => {
    proxy.mockResolvedValue({
      results: [
        hit(1, 'nordstrom.com', '/browse/women/shoes/boots', 'Women\'s Boots | Nordstrom'),
        hit(2, 'macys.com', '/shop/womens-clothing/boots', 'Boots for Women'),
        hit(3, 'vogue.com', '/article/best-tan-boots', 'The best tan boots to buy now'),
        hit(4, 'zara.com', '/us/en/tan-sneakers-p1.html', 'Tan leather sneakers'),
        hit(5, 'zara.com', '/us/en/tan-boots-p2.html', 'Tan suede boots'),
        { ...hit(5, 'hm.com', '/en_us/productpage.1.html', 'Tan suede boots'), thumbnail: { src: 'https://imgs.search.brave.com/t/zara.com-5' } },
        hit(6, 'asos.com', '/us/search/?q=boots', 'ASOS boots'),
      ],
    });

    const res = await lens.searchProductsByText('tan boots');

    expect(res.results.map(r => r.title)).toEqual(['Tan suede boots']);
    expect(res.results[0].source).toBe('zara.com');
  });

  it('gives the person\'s resale-minded search a clear empty list rather than padding', async () => {
    proxy.mockResolvedValue({ results: [hit(1, 'pinterest.com', '/pin/1', 'Tan boots pin'), TODDLER] });
    const res = await lens.searchProductsByText('tan suede knee high boots');
    expect(res.results).toEqual([]);
    expect(res.error).toBeUndefined();
  });

  it('keeps children\'s results when the search is for children', async () => {
    proxy.mockResolvedValue({ results: [TODDLER, NORDSTROM] });
    const res = await lens.searchProductsByText('toddler chelsea boot');
    expect(res.results.map(r => r.title)).toEqual(["Toddler Boys' Brown Chelsea Boot"]);
  });
});

describe('text search: the query sent to Brave', () => {
  it('excludes the main resale hosts at the source and asks for many results', async () => {
    proxy.mockResolvedValue({ results: Array.from({ length: 8 }, (_, n) => hit(n, 'zara.com', `/us/en/boot-${n}-p${n}.html`, `Tan suede boots ${n}`)) });

    await lens.searchProductsByText('  Tan   boots  ');

    expect(proxy).toHaveBeenCalledTimes(1);
    const [provider, payload] = proxy.mock.calls[0];
    expect(provider).toBe('brave');
    expect(payload.q.startsWith('Tan boots -site:ebay.com -site:poshmark.com')).toBe(true);
    expect(payload.q.length).toBeLessThanOrEqual(BRAVE_QUERY_MAX);
    expect(payload.num).toBeGreaterThanOrEqual(30);
  });

  it('sends no exclusions when resale is included', async () => {
    proxy.mockResolvedValue({ results: [ZARA] });
    await lens.searchProductsByText('tan boots', { includeResale: true });
    expect(proxy.mock.calls[0][1].q).toBe('tan boots');
  });

  it('adds the category noun to a short search that names no product', async () => {
    proxy.mockResolvedValue({ results: [] });
    await lens.searchProductsByText('bottega', { category: 'bags', includeResale: true });
    expect(proxy.mock.calls[0][1].q).toBe('bottega bag');
  });

  it('cannot be made to send operators by typing them', async () => {
    proxy.mockResolvedValue({ results: [] });
    await lens.searchProductsByText('boots -site:nordstrom.com OR site:zara.com', { includeResale: true });
    expect(proxy.mock.calls[0][1].q).toBe('boots site nordstrom.com site zara.com');
  });

  it('keeps even a very long search under the cap', async () => {
    proxy.mockResolvedValue({ results: [] });
    await lens.searchProductsByText(Array.from({ length: 60 }, (_, i) => `supercalifragilistic${i}`).join(' '));
    for (const [, payload] of proxy.mock.calls) expect(payload.q.length).toBeLessThanOrEqual(BRAVE_QUERY_MAX);
  });

  it('does not search when only operator characters were typed', async () => {
    const res = await lens.searchProductsByText('-- ::');
    expect(proxy).not.toHaveBeenCalled();
    expect(res.results).toEqual([]);
  });

  it('asks again without the exclusions when they leave too few shops, and merges the answers', async () => {
    proxy.mockImplementation(async (_p: string, payload: { q: string }) =>
      payload.q.includes('-site:')
        ? { results: [ZARA] }
        : { results: [...EBAY, NORDSTROM, ZARA] },
    );

    const res = await lens.searchProductsByText('tan suede knee high boots');

    expect(proxy).toHaveBeenCalledTimes(2);
    expect(proxy.mock.calls[0][1].q).toContain('-site:ebay.com');
    expect(proxy.mock.calls[1][1].q).not.toContain('-site:');
    const hosts = idsOf(res);
    expect(hosts.slice(0, 2).sort()).toEqual(['nordstrom.com', 'zara.com']);
    expect(hosts.filter(h => h === 'zara.com')).toHaveLength(1);
    expect(hosts.filter(h => h === 'ebay.com')).toHaveLength(4);
  });

  it('does not ask twice when the first answer already has enough shops', async () => {
    proxy.mockResolvedValue({
      results: Array.from({ length: 7 }, (_, n) => hit(n, 'zara.com', `/us/en/boot-${n}-p${n}.html`, `Tan suede boots ${n}`)),
    });
    await lens.searchProductsByText('tan boots');
    expect(proxy).toHaveBeenCalledTimes(1);
  });

  it('retries with the compact query against a proxy that still has the 200 character limit', async () => {
    proxy.mockImplementation(async (_p: string, payload: { q: string }) => {
      if (payload.q.length > COMPACT_QUERY_MAX) throw new Error('ai-proxy brave 400: {"error":"q too long"}');
      return { results: Array.from({ length: 7 }, (_, n) => hit(n, 'zara.com', `/us/en/boot-${n}-p${n}.html`, `Tan suede boots ${n}`)) };
    });

    const res = await lens.searchProductsByText('tan boots');

    expect(res.error).toBeUndefined();
    expect(res.results).toHaveLength(7);
    const lengths = proxy.mock.calls.map(c => c[1].q.length);
    expect(lengths[0]).toBeGreaterThan(COMPACT_QUERY_MAX);
    expect(lengths[1]).toBeLessThanOrEqual(COMPACT_QUERY_MAX);
  });

  it('searches again without the exclusions if the engine refuses them', async () => {
    proxy.mockImplementation(async (_p: string, payload: { q: string }) => {
      if (payload.q.includes('-site:')) throw new Error('ai-proxy brave 422: {"error":"bad query"}');
      return { results: [NORDSTROM, ZARA] };
    });

    const res = await lens.searchProductsByText('tan suede knee high boots');

    expect(res.error).toBeUndefined();
    expect(res.results.map(r => r.source).sort()).toEqual(['nordstrom.com', 'zara.com']);
    expect(proxy).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['signed out', 'ai-proxy brave 401: {"error":"invalid auth"}'],
    ['rate limited', 'ai-proxy brave 429: {"error":"rate limited"}'],
    ['server error', 'ai-proxy brave 500: {"error":"upstream failed"}'],
  ])('does not repeat a search that failed for another reason (%s)', async (_name, message) => {
    proxy.mockRejectedValue(new Error(message));
    const res = await lens.searchProductsByText('tan suede knee high boots');
    expect(proxy).toHaveBeenCalledTimes(1);
    expect(res.results).toEqual([]);
    expect(res.error).toBeTruthy();
  });

  it('a failed first search is a friendly error, not a silent empty list', async () => {
    proxy.mockRejectedValue(new Error('ai-proxy brave 500: {"error":"boom"}'));
    const res = await lens.searchProductsByText('tan boots');
    expect(res.results).toEqual([]);
    expect(res.error).toBe("Couldn't search right now. Check your connection and try again.");
  });

  it('keeps the first answer when only the retry fails', async () => {
    proxy
      .mockResolvedValueOnce({ results: [NORDSTROM] })
      .mockRejectedValueOnce(new Error('network'));
    const res = await lens.searchProductsByText('tan suede knee high boots');
    expect(res.error).toBeUndefined();
    expect(res.results.map(r => r.source)).toEqual(['nordstrom.com']);
  });
});

describe('photo search: the text query comes from what was detected', () => {
  const vision = (web: any, labels: string[] = []) => ({
    responses: [{ labelAnnotations: labels.map(description => ({ description })), webDetection: web }],
  });

  it('searches the web for brand + colour + product type, not for the label soup', async () => {
    proxy.mockImplementation(async (provider: string) =>
      provider === 'vision'
        ? vision(
            { bestGuessLabels: [{ label: 'footwear shoe boot fashion' }] },
            ['Footwear', 'Shoe', 'Boot', 'Fashion', 'Brown'],
          )
        : { results: [NORDSTROM, ZARA] },
    );

    const res = await lens.searchByImage('file:///boots.jpg', {
      color: 'tan',
      subtype: 'knee-high boots',
      category: 'shoes',
    });

    expect(res.query).toBe('tan knee-high boots');
    const brave = proxy.mock.calls.find(c => c[0] === 'brave');
    expect(brave).toBeDefined();
    expect(brave![1].q.startsWith('tan knee-high boots -site:')).toBe(true);
    expect(res.results.map(r => r.source).sort()).toEqual(['nordstrom.com', 'zara.com']);
  });

  it('removes the toddler boot and puts shops before resale from the photo\'s own matches too', async () => {
    proxy.mockImplementation(async (provider: string) =>
      provider === 'vision'
        ? vision({
            pagesWithMatchingImages: [
              { url: 'https://www.ebay.com/itm/1', pageTitle: 'Tan suede boots', score: 0.9, fullMatchingImages: [{ url: 'https://i.ebayimg.com/1.jpg' }] },
              { url: 'https://poshmark.com/listing/tan-boots-1', pageTitle: 'Tan suede boots', score: 0.8, fullMatchingImages: [{ url: 'https://images.poshmark.com/1.jpg' }] },
              { url: 'https://www.nordstrom.com/s/chelsea-boot/8888', pageTitle: "Toddler Boys' Brown Chelsea Boot", score: 0.7, fullMatchingImages: [{ url: 'https://n.nordstrommedia.com/2.jpg' }] },
              { url: 'https://www.nordstrom.com/s/suede-knee-high-boot/7777', pageTitle: "Women's Suede Knee High Boot", score: 0.5, fullMatchingImages: [{ url: 'https://n.nordstrommedia.com/1.jpg' }] },
              { url: 'https://www.pinterest.com/pin/1', pageTitle: 'Tan boots', score: 0.9, fullMatchingImages: [{ url: 'https://i.pinimg.com/1.jpg' }] },
            ],
          })
        : { results: [] },
    );

    const res = await lens.searchByImage('file:///boots.jpg', { subtype: 'knee-high boots', category: 'shoes' });

    expect(res.results.map(r => r.source)).toEqual(['nordstrom.com', 'ebay.com', 'poshmark.com']);
    expect(res.results.some(r => /toddler/i.test(r.title))).toBe(false);
  });

  it('does not search the web again when the photo already found enough shops', async () => {
    const pages = Array.from({ length: 6 }, (_, n) => ({
      url: `https://www.zara.com/us/en/suede-boots-${n}-p${n}.html`,
      pageTitle: `Suede boots ${n}`,
      score: 0.9,
      fullMatchingImages: [{ url: `https://static.zara.net/${n}.jpg` }],
    }));
    proxy.mockResolvedValue(vision({ pagesWithMatchingImages: pages }));

    const res = await lens.searchByImage('file:///boots.jpg', { subtype: 'boots', category: 'shoes' });

    expect(proxy.mock.calls.every(c => c[0] === 'vision')).toBe(true);
    expect(res.results).toHaveLength(6);
  });

  it('a failed text search for the photo leaves the photo\'s own matches', async () => {
    proxy.mockImplementation(async (provider: string) => {
      if (provider === 'brave') throw new Error('network');
      return vision({
        pagesWithMatchingImages: [
          { url: 'https://www.zara.com/us/en/suede-boots-p1.html', pageTitle: 'Suede boots', score: 0.9, fullMatchingImages: [{ url: 'https://static.zara.net/1.jpg' }] },
        ],
      });
    });
    const res = await lens.searchByImage('file:///boots.jpg', { subtype: 'boots' });
    expect(res.error).toBeUndefined();
    expect(res.results).toHaveLength(1);
  });
});

describe('refineLensResults (the "Is it one of these?" list)', () => {
  const r = (over: Partial<lens.LensResult>): lens.LensResult => ({
    id: 'x',
    title: 'Tan suede knee high boots',
    source: 'zara.com',
    url: 'https://www.zara.com/us/en/tan-boots-p1.html',
    imageUrl: 'https://static.zara.net/1.jpg',
    similarity: 0.5,
    isShopping: true,
    ...over,
  });
  const attrs = { color: 'tan', subtype: 'knee-high boots', category: 'shoes' };

  const adultTanBoot = (id: string, host: string, extra: Partial<lens.LensResult> = {}) =>
    r({
      id,
      source: host,
      url: `https://www.${host}/p/${id}`,
      imageUrl: `https://img.example.com/${id}.jpg`,
      ...extra,
    });

  it('for adult tan boots, never offers a toddler\'s brown chelsea boot, and lists shops first', () => {
    const out = lens.refineLensResults(
      [
        adultTanBoot('ebay1', 'ebay.com', { similarity: 0.99 }),
        adultTanBoot('ebay2', 'ebay.com', { similarity: 0.98, title: 'Tan suede boots womens' }),
        adultTanBoot('ebay3', 'ebay.com', { similarity: 0.97, title: 'Suede boots tan knee' }),
        adultTanBoot('ebay4', 'ebay.com', { similarity: 0.96, title: 'Knee high boots tan suede 8' }),
        adultTanBoot('posh1', 'poshmark.com', { similarity: 0.95, title: 'Tan knee high boots poshmark' }),
        adultTanBoot('posh2', 'poshmark.com', { similarity: 0.94, title: 'Knee high tan boots 9' }),
        adultTanBoot('toddler', 'nordstrom.com', {
          similarity: 1,
          title: "Toddler Boys' Brown Chelsea Boot",
          imageUrl: 'https://img.example.com/toddler.jpg',
        }),
        adultTanBoot('nord', 'nordstrom.com', { similarity: 0.2, title: "Women's Suede Knee High Boot" }),
        adultTanBoot('zara', 'zara.com', { similarity: 0.1, title: 'Suede high heel boots' }),
      ],
      attrs,
      12,
    );

    const ids = out.map(x => x.id);
    expect(ids).not.toContain('toddler');
    expect(ids.slice(0, 2).sort()).toEqual(['nord', 'zara']);
    expect(ids.slice(2).sort()).toEqual(['ebay1', 'ebay2', 'ebay3', 'ebay4', 'posh1', 'posh2']);
    expect(out[0].sourceKind).toBe('retail');
    expect(out[out.length - 1].sourceKind).toBe('resale');
  });

  it('drops resale entirely once six shop results are there, unless asked', () => {
    const shops = Array.from({ length: 6 }, (_, i) =>
      adultTanBoot(`shop${i}`, 'zara.com', { title: `Tan suede boots ${i}` }),
    );
    const resale = [adultTanBoot('ebay1', 'ebay.com'), adultTanBoot('posh1', 'poshmark.com', { title: 'Tan knee high boots womens' })];
    expect(lens.refineLensResults([...resale, ...shops], attrs, 12).map(x => x.id)).toEqual(
      shops.map(x => x.id),
    );
    expect(lens.refineLensResults([...resale, ...shops], attrs, 12, { includeResale: true })).toHaveLength(8);
  });

  it('wrong product types are gone: sneakers and bags for a boot', () => {
    const out = lens.refineLensResults(
      [
        adultTanBoot('sneaker', 'zara.com', { title: 'Tan leather sneakers' }),
        adultTanBoot('bag', 'zara.com', { title: 'Tan suede bag' }),
        adultTanBoot('boot', 'zara.com', { title: 'Tan suede boots' }),
      ],
      attrs,
    );
    expect(out.map(x => x.id)).toEqual(['boot']);
  });

  it('a page from an unknown site has to say what it is', () => {
    const out = lens.refineLensResults(
      [
        adultTanBoot('random', 'randomblog.example', { title: 'My weekend in Lisbon' }),
        adultTanBoot('boutique', 'smallboutique.example', { title: 'Tan suede knee high boots' }),
      ],
      attrs,
    );
    expect(out.map(x => x.id)).toEqual(['boutique']);
  });

  it('keeps the brand\'s own site as a shop', () => {
    const out = lens.refineLensResults(
      [
        adultTanBoot('ebay1', 'ebay.com', { title: 'Stuart Weitzman tan boots' }),
        adultTanBoot('own', 'stuartweitzman.com', { title: 'Tan boots' }),
      ],
      { ...attrs, brand: 'Stuart Weitzman' },
    );
    expect(out.map(x => x.id)).toEqual(['own', 'ebay1']);
  });

  it('removes repeats of the same picture or title', () => {
    const out = lens.refineLensResults(
      [
        adultTanBoot('a', 'zara.com', { imageUrl: 'https://img.example.com/same.jpg' }),
        adultTanBoot('b', 'hm.com', { imageUrl: 'https://img.example.com/same.jpg?w=300' }),
        adultTanBoot('c', 'zara.com', { title: 'Tan suede knee high boots', imageUrl: 'https://img.example.com/c.jpg' }),
        adultTanBoot('d', 'mango.com', { title: 'Tan boots mango', imageUrl: 'https://img.example.com/d.jpg' }),
      ],
      attrs,
    );
    expect(out.map(x => x.id).sort()).toEqual(['a', 'd']);
  });

  it('limits the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => adultTanBoot(`s${i}`, 'zara.com', { title: `Tan suede boots ${i}` }));
    expect(lens.refineLensResults(many, attrs, 12)).toHaveLength(12);
  });
});

describe('scoring against what was detected', () => {
  const score = (title: string, subtype: string) =>
    lens.scoreLensResultByAttributes({ title, source: 'zara.com', similarity: 0.5 }, { subtype, color: 'tan' });

  it('prefers a knee-high boot for a knee-high boot, and an ankle boot for an ankle boot', () => {
    expect(score('Tan suede knee high boots', 'knee-high boots')).toBeGreaterThan(score('Tan suede chelsea boots', 'knee-high boots'));
    expect(score('Tan suede ankle boots', 'ankle boots')).toBeGreaterThan(score('Tan suede over-the-knee boots', 'ankle boots'));
  });

  it('a boot without a height is not marked down', () => {
    expect(score('Tan suede boots', 'knee-high boots')).toBeGreaterThan(score('Tan suede chelsea boots', 'knee-high boots'));
    expect(score('Tan suede boots', 'ankle boots')).toBeGreaterThan(score('Tan suede tall boots', 'ankle boots'));
  });
});

describe('colour matching against titles', () => {
  const score = (title: string, color: string) =>
    lens.scoreLensResultByAttributes({ title, source: 'zara.com', similarity: 0.5 }, { subtype: 'boots', color });

  it('a dark brown boot matches the words shops use for it, and not an unrelated colour', () => {
    const unrelated = score('Black suede boots', 'dark brown');
    for (const title of ['Brown suede boots', 'Espresso suede boots', 'Chocolate suede boots', 'Mocha suede boots']) {
      expect(score(title, 'dark brown')).toBeGreaterThan(unrelated);
    }
    expect(score('Dark brown suede boots', 'dark brown')).toBeGreaterThan(score('Brown suede boots', 'dark brown'));
  });

  it('a light gray item matches gray, grey and silver', () => {
    const unrelated = score('Black wool boots', 'light gray');
    for (const title of ['Gray wool boots', 'Grey wool boots', 'Silver wool boots']) {
      expect(score(title, 'light gray')).toBeGreaterThan(unrelated);
    }
  });

  it('has an entry for every colour the app can detect, except the two a title can only say one way', () => {
    const oneWay = new Set(['white', 'black']);
    const missing = CLOTHING_COLORS.map(c => c.name).filter(
      name => !oneWay.has(name) && !(lens.COLOR_SYNONYMS[name]?.length > 0),
    );
    expect(missing).toEqual([]);
  });

  it('never lists a colour as its own synonym, or a synonym that is not lower-case', () => {
    for (const [name, synonyms] of Object.entries(lens.COLOR_SYNONYMS)) {
      expect(synonyms).not.toContain(name);
      for (const word of [name, ...synonyms]) expect(word).toBe(word.toLowerCase());
    }
  });
});
