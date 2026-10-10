/**
 * Search through lensSearchService with the network mocked:
 *   - a picture match that is only an image file is not a shop, and does not stop
 *     the text search that a photo of your own boots needs;
 *   - stock-photo sites are never shops and cannot hide resale listings;
 *   - retail pages in shelf-shaped folders (Gap, J.Crew, URBN) are returned;
 *   - what Add Item has already detected (`hints`) sets the query and the product-type filter.
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
import { countShopResults } from '../../src/services/searchRanking';

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

const vision = (web: any, labels: string[] = []) => ({
  responses: [{ labelAnnotations: labels.map(description => ({ description })), webDetection: web }],
});

/** Vision for a photo that no page matches, answered with brave for the text search. */
const visionThenBrave = (web: any, brave: any[], labels: string[] = []) =>
  proxy.mockImplementation(async (provider: string) =>
    provider === 'vision' ? vision(web, labels) : { results: brave },
  );

const NORDSTROM = hit(1, 'nordstrom.com', '/s/suede-knee-high-boot/7777', "Women's Suede Knee High Boot | Nordstrom");
const ZARA = hit(1, 'zara.com', '/us/en/suede-high-heel-boots-p12345.html', 'Suede high heel boots - Zara United States');

describe('photo search: similar images are pictures, not shops', () => {
  // What Vision sends for a photo of your own boots: no matching pages, and a pile of
  // image files from assorted hosts, some with no file extension at all.
  const SIMILAR_IMAGES = [
    'https://static.zara.net/photos/2024/boot-1.jpg',
    'https://assets.adidas.com/images/h_840/boot.jpg',
    'https://images.asos-media.com/products/a/123',
    'https://cdn.shopify.com/s/files/1/0001/boot.png?v=1',
    'https://m.media-amazon.com/images/I/81abc.jpg',
    'https://images.blogsite1.com/wp-content/boot.webp',
    'https://n.nordstrommedia.com/id/sr3/boot.jpeg',
    'https://i.ebayimg.com/images/g/abc/s-l1600.jpg',
    'https://i.etsystatic.com/123/r/il/abc/il_794xN.jpg',
    'https://img.mercdn.net/item/detail/orig/photos/m1.jpg',
    'https://images.vinted.net/t/01_abc/f800.jpeg',
  ].map(url => ({ url }));

  const hints = { color: 'tan', subtype: 'knee-high boots', category: 'shoes' };

  it('still searches the web for what was detected, however many image files Vision found', async () => {
    visionThenBrave({ pagesWithMatchingImages: [], visuallySimilarImages: SIMILAR_IMAGES }, [NORDSTROM, ZARA]);

    const res = await lens.searchByImage('file:///boots.jpg', hints);

    expect(proxy.mock.calls.map(c => c[0])).toContain('brave');
    expect(res.results.map(r => r.source).sort()).toEqual(['nordstrom.com', 'zara.com']);
  });

  it('never returns a card titled with a host, or linked to a picture file', async () => {
    visionThenBrave({ pagesWithMatchingImages: [], visuallySimilarImages: SIMILAR_IMAGES }, []);

    const res = await lens.searchByImage('file:///boots.jpg', hints);

    expect(res.results).toEqual([]);
    expect(res.error).toBeUndefined();
  });

  it('does so without hints too', async () => {
    visionThenBrave(
      { bestGuessLabels: [{ label: 'tan boots' }], pagesWithMatchingImages: [], visuallySimilarImages: SIMILAR_IMAGES },
      [ZARA],
    );

    const res = await lens.searchByImage('file:///boots.jpg');

    expect(proxy.mock.calls.map(c => c[0])).toContain('brave');
    expect(res.results.map(r => r.source)).toEqual(['zara.com']);
    expect(res.results.some(r => r.id.startsWith('sim-'))).toBe(false);
  });

  it('still lends a similar image as the thumbnail of a page that has none of its own', async () => {
    visionThenBrave(
      {
        pagesWithMatchingImages: [{ url: 'https://www.zara.com/us/en/suede-boots-p1.html', pageTitle: 'Suede boots' }],
        visuallySimilarImages: [{ url: 'http://static.zara.net/similar.jpg' }],
      },
      [],
    );

    const res = await lens.searchByImage('file:///boots.jpg', { subtype: 'boots' });

    expect(res.results).toHaveLength(1);
    expect(res.results[0].imageUrl).toBe('https://static.zara.net/similar.jpg');
    expect(res.results[0].url).toBe('https://www.zara.com/us/en/suede-boots-p1.html');
  });

  it('drops a matching "page" that is itself a picture file, and a page on an image host', async () => {
    visionThenBrave(
      {
        pagesWithMatchingImages: [
          { url: 'https://static.zara.net/photos/boot.jpg', pageTitle: 'Suede boots', fullMatchingImages: [{ url: 'https://static.zara.net/photos/boot.jpg' }] },
          { url: 'https://i.ebayimg.com/images/g/abc/s-l1600', pageTitle: 'Suede boots', fullMatchingImages: [{ url: 'https://i.ebayimg.com/images/g/abc/s-l1600.jpg' }] },
          { url: 'https://www.zara.com/us/en/suede-boots-p2.html', pageTitle: 'Suede boots', fullMatchingImages: [{ url: 'https://static.zara.net/2.jpg' }] },
        ],
      },
      [],
    );

    const res = await lens.searchByImage('file:///boots.jpg', { subtype: 'boots' });

    expect(res.results.map(r => r.url)).toEqual(['https://www.zara.com/us/en/suede-boots-p2.html']);
  });

  it('refineLensResults (Add Item) offers none of them, even if they carry an old resale or retail stamp', () => {
    const picture = (id: string, host: string, kind: lens.LensResult['sourceKind']): lens.LensResult => ({
      id,
      title: host,
      source: host,
      url: `https://${host}/images/${id}.jpg`,
      imageUrl: `https://${host}/images/${id}.jpg`,
      similarity: 0.5,
      isShopping: true,
      sourceKind: kind,
    });
    const out = lens.refineLensResults(
      [
        picture('a', 'i.ebayimg.com', 'resale'),
        picture('b', 'i.etsystatic.com', 'resale'),
        picture('c', 'static.zara.net', 'retail'),
        picture('d', 'i.ebayimg.com', undefined),
        picture('e', 'cdn.somesite.example', undefined),
      ],
      { subtype: 'knee-high boots', category: 'shoes', color: 'tan' },
      12,
    );
    expect(out).toEqual([]);
  });
});

describe('text search: stock-photo sites are not shops', () => {
  const STOCK = [
    hit(1, 'shutterstock.com', '/image-photo/tan-suede-knee-high-boots-on-white-1234567', 'Tan suede knee high boots on white background'),
    hit(1, 'alamy.com', '/stock-photo-tan-suede-knee-high-boots-12345.html', 'Tan suede knee high boots Stock Photo'),
    hit(1, 'dreamstime.com', '/stock-photo-tan-suede-knee-high-boots-image12345', 'Tan suede knee high boots Stock Image'),
    hit(1, 'freepik.com', '/premium-photo/tan-suede-knee-high-boots_1234.htm', 'Premium Photo | Tan suede knee high boots'),
    hit(1, 'depositphotos.com', '/12345/stock-photo-tan-suede-knee-high-boots.html', 'Tan suede knee high boots Stock Photo'),
    hit(1, 'istockphoto.com', '/photo/tan-suede-knee-high-boots-gm12345', 'Tan suede knee high boots Stock Photo, Picture And Royalty Free'),
  ];
  const EBAY = hit(1, 'ebay.com', '/itm/101', 'Tan suede knee high boots womens size 7 | eBay');
  const POSH = hit(1, 'poshmark.com', '/listing/Tan-Suede-Boots-1abc', 'Tan Suede Boots Size 8 Poshmark');

  it('are dropped, and the shops and resale listings that were there stay', async () => {
    proxy.mockResolvedValue({ results: [NORDSTROM, STOCK[0], STOCK[1], STOCK[3], EBAY, POSH] });

    const res = await lens.searchProductsByText('tan suede knee high boots');

    expect(res.results.map(r => r.source)).toEqual(['nordstrom.com', 'ebay.com', 'poshmark.com']);
    expect(res.results.map(r => r.sourceKind)).toEqual(['retail', 'resale', 'resale']);
  });

  it('six of them do not count as six shops, so they cannot hide the resale listings', async () => {
    proxy.mockResolvedValue({ results: [NORDSTROM, ...STOCK, EBAY, POSH] });

    const res = await lens.searchProductsByText('tan suede knee high boots');

    expect(res.results.map(r => r.source)).toEqual(['nordstrom.com', 'ebay.com', 'poshmark.com']);
    expect(countShopResults(res.results)).toBe(1);
  });

  it('are dropped from a photo search and from the Add Item list too', async () => {
    visionThenBrave(
      {
        pagesWithMatchingImages: [
          { url: STOCK[0].url, pageTitle: STOCK[0].title, fullMatchingImages: [{ url: 'https://image.shutterstock.com/1.jpg' }] },
          { url: 'https://www.nordstrom.com/s/suede-knee-high-boot/7777', pageTitle: "Women's Suede Knee High Boot", fullMatchingImages: [{ url: 'https://n.nordstrommedia.com/1.jpg' }] },
        ],
      },
      [],
    );

    const res = await lens.searchByImage('file:///boots.jpg', { subtype: 'knee-high boots', category: 'shoes' });
    expect(res.results.map(r => r.source)).toEqual(['nordstrom.com']);

    const refined = lens.refineLensResults(
      STOCK.map((h, i) => ({
        id: `s${i}`,
        title: h.title,
        source: new URL(h.url).hostname.replace(/^www\./, ''),
        url: h.url,
        imageUrl: h.thumbnail.src,
        similarity: 0.5,
        isShopping: false,
      })),
      { subtype: 'knee-high boots', category: 'shoes' },
      12,
    );
    expect(refined).toEqual([]);
  });
});

describe('text search: retail product pages in shelf-shaped folders are returned', () => {
  const PRODUCTS = [
    hit(1, 'gap.com', '/browse/product.do?pid=7981310020002', 'Suede Ankle Boots | Gap'),
    hit(2, 'oldnavy.gap.com', '/browse/product.do?pid=6543210030015', 'Faux-Suede Ankle Boots for Women | Old Navy'),
    hit(3, 'jcrew.com', '/p/womens/categories/shoes/boots/piper-suede-boot/AB123', 'Piper suede boot - J.Crew'),
    hit(4, 'anthropologie.com', '/shop/pilcro-lucy-boots', 'Pilcro Lucy Suede Boots - Anthropologie'),
    hit(5, 'freepeople.com', '/shop/we-the-free-jessie-western-boot/', 'Jessie Western Boot - Free People'),
    hit(6, 'urbanoutfitters.com', '/shop/uo-sloane-suede-boot', 'UO Sloane Suede Boot - Urban Outfitters'),
    hit(7, 'macys.com', '/shop/product/steve-madden-mari-boots?ID=12345678', 'Steve Madden Mari Boots - Macy\'s'),
  ];
  const SHELVES = [
    hit(8, 'gap.com', '/browse/category.do?cid=1127938', 'Women\'s Boots | Gap'),
    hit(9, 'anthropologie.com', '/shop/womens-boots', 'Suede boots - Anthropologie'),
    hit(10, 'jcrew.com', '/plp/womens/categories/shoes/boots', 'Suede boots - J.Crew'),
    hit(11, 'macys.com', '/shop/womens-clothing/boots', 'Suede boots - Macy\'s'),
  ];

  it('keeps the products and drops the shelves', async () => {
    proxy.mockResolvedValue({ results: [...SHELVES, ...PRODUCTS] });

    const res = await lens.searchProductsByText('suede boots', { includeResale: true });

    expect(res.results.map(r => r.source).sort()).toEqual(
      ['anthropologie.com', 'freepeople.com', 'gap.com', 'jcrew.com', 'macys.com', 'oldnavy.gap.com', 'urbanoutfitters.com'],
    );
    expect(res.results.every(r => r.sourceKind === 'retail')).toBe(true);
  });

  it('keeps a brand line in a product title', async () => {
    proxy.mockResolvedValue({
      results: [
        hit(1, 'ralphlauren.com', '/boots/ralph-lauren-collection-suede-boots-p1.html', 'Ralph Lauren Collection Suede Knee High Boots'),
        hit(2, 'michaelkors.com', '/leather-knee-high-boot-p2.html', "Michael Kors Collection Women's Leather Knee High Boot"),
      ],
    });

    const res = await lens.searchProductsByText('knee high boots', { includeResale: true });

    expect(res.results).toHaveLength(2);
  });
});

describe('photo search with what Add Item has detected', () => {
  const FLATS_PAGE = {
    url: 'https://www.nordstrom.com/s/ballet-flat/1111',
    pageTitle: "Women's Ballet Flat | Nordstrom",
    score: 0.9,
    fullMatchingImages: [{ url: 'https://n.nordstrommedia.com/flat.jpg' }],
  };
  const BOOT_PAGES = [
    {
      url: 'https://www.nordstrom.com/s/suede-knee-high-boot/7777',
      pageTitle: "Women's Suede Knee High Boot | Nordstrom",
      score: 0.8,
      fullMatchingImages: [{ url: 'https://n.nordstrommedia.com/boot.jpg' }],
    },
    {
      url: 'https://www.zara.com/us/en/suede-knee-high-boots-p2.html',
      pageTitle: 'Suede knee high boots - Zara',
      score: 0.7,
      fullMatchingImages: [{ url: 'https://static.zara.net/boot.jpg' }],
    },
  ];
  // Tan knee-high boots worn over black ballet flats: the guess names both and ends on the flats.
  const web = {
    bestGuessLabels: [{ label: 'tan boots black ballet flats' }],
    pagesWithMatchingImages: [FLATS_PAGE, ...BOOT_PAGES],
  };
  const braveQueries = () => proxy.mock.calls.filter(c => c[0] === 'brave').map(c => c[1].q as string);

  it('without hints, goes on the picture\'s guess: the flats page wins and the boots are filtered out', async () => {
    visionThenBrave(web, []);

    const res = await lens.searchByImage('file:///boots.jpg');

    expect(res.query).toBe('tan boots black ballet flats');
    expect(res.results.map(r => r.title)).toEqual(["Women's Ballet Flat"]);
  });

  it('with the detected subtype, searches for that and keeps the boots, not the flats', async () => {
    visionThenBrave(web, [ZARA]);

    // The call Add Item makes: the photo, then what it detected. Typed against the real signature.
    const call: Parameters<typeof lens.searchByImage> = [
      'file:///boots.jpg',
      { brand: 'Stuart Weitzman', color: 'tan', subtype: 'knee-high boots', category: 'shoes' },
    ];
    const res = await lens.searchByImage(...call);

    expect(res.query).toBe('Stuart Weitzman tan knee-high boots');
    expect(braveQueries()[0].startsWith('Stuart Weitzman tan knee-high boots -site:')).toBe(true);
    const titles = res.results.map(r => r.title);
    expect(titles).toContain("Women's Suede Knee High Boot");
    expect(titles).toContain('Suede knee high boots');
    expect(titles.some(t => /flat/i.test(t))).toBe(false);
  });

  it('the hints alone decide the query when Vision names nothing', async () => {
    visionThenBrave({ pagesWithMatchingImages: [] }, [NORDSTROM], ['Footwear', 'Shoe', 'Brown']);

    const withHints = await lens.searchByImage('file:///boots.jpg', { color: 'tan', subtype: 'knee-high boots', category: 'shoes' });
    expect(withHints.query).toBe('tan knee-high boots');
    expect(withHints.results.map(r => r.source)).toEqual(['nordstrom.com']);

    proxy.mockClear();
    const without = await lens.searchByImage('file:///boots.jpg');
    expect(without.query).toBe('');
    expect(braveQueries()).toEqual([]);
  });

  it('a children\'s hint turns the adult filter round', async () => {
    visionThenBrave(
      {
        pagesWithMatchingImages: [
          { url: 'https://www.nordstrom.com/s/chelsea-boot/8888', pageTitle: "Toddler Boys' Brown Chelsea Boot", score: 0.9, fullMatchingImages: [{ url: 'https://n.nordstrommedia.com/t.jpg' }] },
          BOOT_PAGES[0],
        ],
      },
      [],
    );

    const adult = await lens.searchByImage('file:///boots.jpg', { subtype: 'boots', category: 'shoes' });
    expect(adult.results.map(r => r.title)).toEqual(["Women's Suede Knee High Boot"]);

    const kids = await lens.searchByImage('file:///boots.jpg', { subtype: 'boots', category: 'shoes', audience: 'kids' });
    expect(kids.results.map(r => r.title)).toEqual(["Toddler Boys' Brown Chelsea Boot"]);
  });
});
