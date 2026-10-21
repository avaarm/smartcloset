/**
 * A search result becomes a wishlist item: what it is and what colour comes from the
 * photo, the brand from the shop's own site or the title, the price as new or used by
 * the kind of shop, and when the photo can't be read the item is still added from the
 * title alone.
 */
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: null } })) } },
}));

// The shop page's pictures are read over the network; here they are what each test says they are.
jest.mock('../../src/services/productUrlService', () => ({ fetchProductImages: jest.fn(async () => []) }));

import { ANALYSIS_WAIT_MS, EXTRA_IMAGES_WAIT_MS, buildWishlistItem, parsePrice } from '../../src/services/wishlistItemBuilder';
import { fetchProductImages } from '../../src/services/productUrlService';
import type { LensResult } from '../../src/services/lensSearchService';
import type { RecognitionResult } from '../../src/services/imageRecognition';

const result = (over: Partial<LensResult> = {}): LensResult => ({
  id: 'r1',
  title: "Women's Small Andiamo in Lava red Bottega Veneta",
  source: 'ebay.com',
  url: 'https://www.ebay.com/itm/1',
  imageUrl: 'https://i.ebayimg.com/1.jpg',
  price: '$3,000',
  similarity: 0.9,
  isShopping: true,
  ...over,
});

const real = (over: Partial<RecognitionResult> = {}): RecognitionResult => ({
  isReal: true,
  category: 'bags',
  type: 'Handbag',
  subtype: 'structured tote',
  color: 'burgundy',
  brand: 'Bottega Veneta',
  confidence: { category: 0.95, type: 0.9, color: 0.91, brand: 0.8 },
  ...over,
});

const NOW = new Date('2026-10-11T12:00:00Z');
const build = (r: LensResult, analyze: any) => buildWishlistItem(r, { analyze, id: 'wish_test', now: NOW });

const mockImages = fetchProductImages as jest.Mock;
beforeEach(() => mockImages.mockReset().mockResolvedValue([]));

describe('what the photo says', () => {
  it('files a bag whose title names no product under bags, with its type and colour', async () => {
    const analyze = jest.fn(async () => real());
    const { item, fromPhoto } = await build(result(), analyze);
    expect(analyze).toHaveBeenCalledWith('https://i.ebayimg.com/1.jpg', { title: result().title });
    expect(item).toEqual(
      expect.objectContaining({
        id: 'wish_test',
        category: 'bags',
        subcategory: 'Handbag',
        color: 'Burgundy',
        isWishlist: true,
        dateAdded: NOW.toISOString(),
      }),
    );
    expect(fromPhoto).toBe(true);
  });

  it('trusts the photo over a title that says something else', async () => {
    const { item } = await build(result({ title: 'Silk top handle clutch' }), async () =>
      real({ category: 'bags', type: 'Clutch' }),
    );
    expect(item.category).toBe('bags');
    expect(item.subcategory).toBe('Clutch');
  });

  it('leaves out a colour or category the photo was not sure of', async () => {
    const { item, fromPhoto } = await build(result({ title: 'Mystery piece' }), async () =>
      real({ confidence: { category: 0.2, color: 0.3 }, type: undefined }),
    );
    expect(item.category).toBe('accessories'); // nothing named it: the catch-all, which the owner can change
    expect(item.color).toBe('');
    expect(fromPhoto).toBe(false);
  });

  it("gives a type only for the category it filed the item under", async () => {
    const { item } = await build(result({ title: 'Leather ankle boots' }), async () =>
      real({ confidence: { category: 0.1 }, category: 'bags', type: 'Tote' }),
    );
    expect(item.category).toBe('shoes'); // from the title, since the photo was unsure
    expect(item.subcategory).toBe('Ankle boots');
  });
});

describe('when the photo cannot be read', () => {
  it.each([
    ['the analysis is not available (a guest)', async () => ({ isReal: false, confidence: {}, unavailableReason: 'signed_out' as const })],
    ['the analysis fails', async () => { throw new Error('offline'); }],
  ])('still adds the item from its title when %s', async (_label, analyze) => {
    const { item, fromPhoto } = await build(result({ title: 'Suede knee-high boots', source: 'zara.com', price: '$129' }), analyze);
    expect(item.category).toBe('shoes');
    expect(item.subcategory).toBe('Knee-high boots');
    expect(item.name).toBe('Suede knee-high boots');
    expect(item.retailCost).toBe(129);
    expect(fromPhoto).toBe(false);
  });

  it('takes a colour named in the title, and none when it names none', async () => {
    const off = async () => ({ isReal: false, confidence: {} });
    expect((await build(result({ title: 'Red leather tote bag' }), off)).item.color).toBe('Red');
    expect((await build(result({ title: 'Leather tote bag' }), off)).item.color).toBe('');
  });

  it('does not wait forever for a slow analysis', async () => {
    jest.useFakeTimers();
    const never = () => new Promise<RecognitionResult>(() => {});
    const pending = buildWishlistItem(result({ title: 'Wool beanie' }), { analyze: never, id: 'w', now: NOW });
    await jest.advanceTimersByTimeAsync(ANALYSIS_WAIT_MS + 10);
    const { item } = await pending;
    expect(item.category).toBe('hats');
    jest.useRealTimers();
  });

  it('skips the analysis when the result has no photo', async () => {
    const analyze = jest.fn();
    const { item } = await build(result({ imageUrl: '', title: 'Gold hoop earrings' }), analyze);
    expect(analyze).not.toHaveBeenCalled();
    expect(item.category).toBe('jewelry');
  });
});

describe('the brand', () => {
  const off = async () => ({ isReal: false, confidence: {} });

  it("is the brand's own site when it is one", async () => {
    expect((await build(result({ source: 'us.gucci.com', title: 'Marmont bag' }), off)).item.brand).toBe('Gucci');
  });

  it("is named from the title when the shop sells every brand (eBay is never the brand)", async () => {
    const { item } = await build(result({ source: 'ebay.com' }), off);
    expect(item.brand).toBe('Bottega Veneta');
  });

  it("is the photo's brand when neither the site nor the title names one", async () => {
    const { item } = await build(result({ source: 'nordstrom.com', title: 'Leather heels' }), async () =>
      real({ category: 'shoes', type: 'Heels', brand: 'Dries Van Noten', confidence: { category: 0.95, brand: 0.8 } }),
    );
    expect(item.brand).toBe('Dries Van Noten');
  });

  it('is empty when nothing names one', async () => {
    expect((await build(result({ source: 'nordstrom.com', title: 'Leather heels' }), off)).item.brand).toBe('');
  });
});

describe('the price', () => {
  const off = async () => ({ isReal: false, confidence: {} });

  it("is the new price for a shop's listing and the used price for a resale one", async () => {
    const shop = (await build(result({ source: 'zara.com', price: '$1,299.50' }), off)).item;
    expect([shop.retailCost, shop.cost]).toEqual([1299.5, undefined]);

    const resale = (await build(result({ source: 'poshmark.com', price: '$310' }), off)).item;
    expect([resale.retailCost, resale.cost]).toEqual([undefined, 310]);
  });

  it('is left out when the listing has none', async () => {
    const { item } = await build(result({ price: undefined }), off);
    expect([item.retailCost, item.cost]).toEqual([undefined, undefined]);
  });

  it.each([
    ['$3,000', 3000],
    ['$89.99', 89.99],
    ['USD 120', 120],
    ['', undefined],
    ['Free', undefined],
    ['$0', undefined],
    [undefined, undefined],
  ])('reads "%s" as %s', (text, expected) => {
    expect(parsePrice(text as any)).toBe(expected);
  });
});

describe('the rest of the item', () => {
  it('records where it was found and starts as an unfavoured, unworn wish', async () => {
    const { item } = await build(result(), async () => real());
    expect(item).toEqual(
      expect.objectContaining({
        retailer: 'ebay.com',
        notes: 'Found via search. Source: https://www.ebay.com/itm/1',
        wearCount: 0,
        favorite: false,
        retailerImage: 'https://i.ebayimg.com/1.jpg',
        season: [],
        tags: [],
      }),
    );
  });

  it('gets an id of its own when none is given', async () => {
    const a = await buildWishlistItem(result(), { analyze: async () => ({ isReal: false, confidence: {} }) });
    const b = await buildWishlistItem(result(), { analyze: async () => ({ isReal: false, confidence: {} }) });
    expect(a.item.id).toMatch(/^wish_\d+_/);
    expect(a.item.id).not.toBe(b.item.id);
  });
});

describe('the pictures', () => {
  const off = async () => ({ isReal: false, confidence: {} });
  const COVER = 'https://i.ebayimg.com/1.jpg';

  it("starts with the result's photo as the cover, then the page's other pictures", async () => {
    mockImages.mockResolvedValue(['https://i.ebayimg.com/2.jpg', 'https://i.ebayimg.com/3.jpg']);
    const { item } = await build(result(), off);
    expect(mockImages).toHaveBeenCalledWith('https://www.ebay.com/itm/1');
    expect(item.images).toEqual([COVER, 'https://i.ebayimg.com/2.jpg', 'https://i.ebayimg.com/3.jpg']);
    expect(item.retailerImage).toBe(COVER);
    expect(item.images![0]).toBe(item.retailerImage);
  });

  it("does not repeat the result's photo when the page lists it too", async () => {
    mockImages.mockResolvedValue([COVER, 'https://i.ebayimg.com/2.jpg', 'https://i.ebayimg.com/2.jpg']);
    const { item } = await build(result(), off);
    expect(item.images).toEqual([COVER, 'https://i.ebayimg.com/2.jpg']);
  });

  it('never holds more photos than an item may have', async () => {
    mockImages.mockResolvedValue(Array.from({ length: 12 }, (_, i) => `https://i.ebayimg.com/x${i}.jpg`));
    const { item } = await build(result(), off);
    expect(item.images).toHaveLength(8);
    expect(item.images![0]).toBe(COVER);
  });

  it('is the result photo alone when the page has no other pictures', async () => {
    const { item } = await build(result(), off);
    expect(item.images).toEqual([COVER]);
    expect(item.retailerImage).toBe(COVER);
  });

  it("makes the page's first picture the cover when the result has none", async () => {
    mockImages.mockResolvedValue(['https://i.ebayimg.com/2.jpg', 'https://i.ebayimg.com/3.jpg']);
    const { item } = await build(result({ imageUrl: '' }), off);
    expect(item.images).toEqual(['https://i.ebayimg.com/2.jpg', 'https://i.ebayimg.com/3.jpg']);
    expect(item.retailerImage).toBe('https://i.ebayimg.com/2.jpg');
  });

  it('does not read a page when the result has no address', async () => {
    const { item } = await build(result({ url: '' }), off);
    expect(mockImages).not.toHaveBeenCalled();
    expect(item.images).toEqual([COVER]);
  });

  it('still adds the item, with the result photo, when reading the page fails', async () => {
    mockImages.mockRejectedValue(new Error('offline'));
    const { item, fromPhoto } = await build(result(), async () => real());
    expect(item.images).toEqual([COVER]);
    expect(item.category).toBe('bags');
    expect(fromPhoto).toBe(true);
  });

  it('survives a reader that throws before it even returns a promise', async () => {
    mockImages.mockImplementation(() => { throw new Error('boom'); });
    const { item } = await build(result(), off);
    expect(item.images).toEqual([COVER]);
  });

  it('reads the page while the photo is analysed, not after it', async () => {
    const order: string[] = [];
    mockImages.mockImplementation(async () => { order.push('page'); return []; });
    const analyze = jest.fn(async () => { order.push('analysis-start'); await Promise.resolve(); order.push('analysis-end'); return real(); });
    await build(result(), analyze);
    expect(order).toEqual(['analysis-start', 'page', 'analysis-end']);
  });

  it('does not wait for a slow page: the item is added with the result photo after the page wait', async () => {
    jest.useFakeTimers();
    try {
      expect(EXTRA_IMAGES_WAIT_MS).toBe(5000);
      mockImages.mockReturnValue(new Promise<string[]>(() => {})); // never answers
      let done = false;
      const pending = build(result(), off).then(built => { done = true; return built; });

      await jest.advanceTimersByTimeAsync(EXTRA_IMAGES_WAIT_MS - 1);
      expect(done).toBe(false);
      await jest.advanceTimersByTimeAsync(2);
      const { item } = await pending;
      expect(done).toBe(true);
      expect(item.images).toEqual([COVER]);
      expect(item.retailerImage).toBe(COVER);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the page wait and the analysis wait separate: a page that never answers does not shorten the analysis wait', async () => {
    jest.useFakeTimers();
    try {
      mockImages.mockReturnValue(new Promise<string[]>(() => {}));
      const never = () => new Promise<RecognitionResult>(() => {});
      let done = false;
      const pending = build(result(), never).then(built => { done = true; return built; });
      await jest.advanceTimersByTimeAsync(EXTRA_IMAGES_WAIT_MS + 10);
      expect(done).toBe(false); // the analysis still has its own, longer, wait
      await jest.advanceTimersByTimeAsync(ANALYSIS_WAIT_MS);
      await pending;
      expect(done).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('takes pictures that arrive just before the wait ends', async () => {
    jest.useFakeTimers();
    try {
      mockImages.mockImplementation(() => new Promise<string[]>(resolve => setTimeout(() => resolve(['https://i.ebayimg.com/2.jpg']), EXTRA_IMAGES_WAIT_MS - 100)));
      const pending = build(result(), off);
      await jest.advanceTimersByTimeAsync(EXTRA_IMAGES_WAIT_MS);
      const { item } = await pending;
      expect(item.images).toEqual([COVER, 'https://i.ebayimg.com/2.jpg']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('can be handed another page reader and wait', async () => {
    const fetchImages = jest.fn(async () => ['https://i.ebayimg.com/9.jpg']);
    const { item } = await buildWishlistItem(result(), { analyze: off, fetchImages, extraImagesWaitMs: 50, id: 'w', now: NOW });
    expect(fetchImages).toHaveBeenCalledWith('https://www.ebay.com/itm/1');
    expect(mockImages).not.toHaveBeenCalled();
    expect(item.images).toEqual([COVER, 'https://i.ebayimg.com/9.jpg']);
  });
});
