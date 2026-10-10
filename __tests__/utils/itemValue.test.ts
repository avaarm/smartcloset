/**
 * The dollar value of an item: the estimate for items with no value of their
 * own, the number shown and added up, and how it is printed.
 */
import { estimateItemValue, formatMoney, formatMoneyCents, itemValue, totalValue, ValueInputs } from '../../src/utils/itemValue';
import { CATEGORY_BASE_PRICE, TIER_MULTIPLIER } from '../../src/utils/itemValueTables';
import { CLOTHING_CATEGORIES } from '../../src/utils/clothingOptions';
import type { ClothingItem, ClothingCategory } from '../../src/types';

const input = (extra: Partial<ValueInputs> = {}): ValueInputs => ({ category: 'tops', name: 'Item', ...extra });
const valueOf = (extra: Partial<ValueInputs>, matchedPrice?: number) =>
  estimateItemValue(input(extra), { matchedPrice }).value;

let n = 0;
const item = (extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id: `i${++n}`,
  name: `Item ${n}`,
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});

describe('estimateItemValue: what the owner entered comes first', () => {
  it.each([
    ['a price paid is the value', { cost: 30 }, undefined, 30, 'paid'],
    ['a price paid is rounded to whole dollars', { cost: 29.6 }, undefined, 30, 'paid'],
    ['a price paid beats the brand', { cost: 200, brand: 'Gucci' }, undefined, 200, 'paid'],
    ['a price paid beats the retail price', { cost: 40, retailCost: 100 }, undefined, 40, 'paid'],
    ['a price paid beats a matched product', { cost: 40 }, 90, 40, 'paid'],
    ['a tiny price is lifted to the $5 floor', { cost: 0.4 }, undefined, 5, 'paid'],
    ['a huge price is capped at $50,000', { cost: 1_000_000 }, undefined, 50_000, 'paid'],
    ['a price of 0 (a gift) falls through to retail', { cost: 0, retailCost: 100 }, undefined, 60, 'retail'],
    ['retail price alone is worth 60% second hand', { retailCost: 100 }, undefined, 60, 'retail'],
    ['luxury brands keep 80% of retail', { retailCost: 100, brand: 'Gucci' }, undefined, 80, 'retail'],
    ['designer brands keep 80% of retail', { retailCost: 100, brand: 'Coach' }, undefined, 80, 'retail'],
    ['premium brands keep 80% of retail', { retailCost: 100, brand: 'Ralph Lauren' }, undefined, 80, 'retail'],
    ['contemporary brands use 60% of retail', { retailCost: 100, brand: 'Madewell' }, undefined, 60, 'retail'],
    ['fast fashion uses 60% of retail', { retailCost: 100, brand: 'Zara' }, undefined, 60, 'retail'],
    ['unknown brands use 60% of retail', { retailCost: 100, brand: 'Nobody Co' }, undefined, 60, 'retail'],
    ['a retail price of $2 is lifted to the $5 floor', { retailCost: 2 }, undefined, 5, 'retail'],
    ['retail beats a matched product', { retailCost: 100 }, 500, 60, 'retail'],
    ['a matched product is worth 60% of its price', {}, 50, 30, 'match'],
    ['a matched luxury product keeps 80%', { brand: 'Prada' }, 50, 40, 'match'],
  ] as Array<[string, Partial<ValueInputs>, number | undefined, number, string]>)(
    '%s',
    (_label, extra, matchedPrice, value, source) => {
      expect(estimateItemValue(input(extra), { matchedPrice })).toEqual({ value, source });
    },
  );

  it.each([
    ['NaN', NaN],
    ['a negative number', -20],
    ['Infinity', Infinity],
    ['nothing', undefined],
    ['text', '30' as unknown as number],
  ])('a price paid of %s is not a price: the estimate comes from the category instead', (_label, cost) => {
    expect(estimateItemValue(input({ cost }))).toEqual({ value: 35, source: 'category' });
  });

  it.each([
    ['NaN', NaN],
    ['0', 0],
    ['a negative number', -5],
    ['Infinity', Infinity],
  ])('a matched price of %s is ignored', (_label, matchedPrice) => {
    expect(estimateItemValue(input(), { matchedPrice })).toEqual({ value: 35, source: 'category' });
  });
});

describe('estimateItemValue: no price at all', () => {
  it.each(Object.entries(CATEGORY_BASE_PRICE) as Array<[ClothingCategory, number]>)(
    'plain %s is worth the category price of $%i',
    (category, price) => {
      expect(estimateItemValue(input({ category }))).toEqual({ value: price, source: 'category' });
    },
  );

  it('has a price for every category the app offers', () => {
    for (const category of CLOTHING_CATEGORIES) {
      expect(CATEGORY_BASE_PRICE[category]).toBeGreaterThan(0);
    }
  });

  it('prices a category it does not know (old data) at $40 rather than NaN', () => {
    expect(estimateItemValue(input({ category: 'capes' as ClothingCategory }))).toEqual({
      value: 40,
      source: 'category',
    });
  });

  it.each([
    ['Gucci', 'luxury', 315],
    ['Michael Kors', 'designer', 140],
    ['Ralph Lauren', 'premium', 77],
    ['Madewell', 'contemporary', 56],
    ['Patagonia', 'outdoor', 53],
    ['Nike', 'athletic', 46],
    ['Gap', 'mid-market', 42],
    ['H&M', 'fast-fashion', 25],
  ])('%s (%s) top is worth $%i and is estimated from the brand', (brand, _tier, value) => {
    expect(estimateItemValue(input({ brand }))).toEqual({ value, source: 'brand' });
  });

  it.each([
    ['bags', 'Gucci', 720],
    ['shoes', 'Louis Vuitton', 630],
    ['outerwear', 'Canada Goose', 198],
    ['dresses', 'Reformation', 96],
    ['activewear', 'Lululemon', 52],
    ['hats', 'Zara', 18],
    ['jewelry', 'Cartier', 540],
  ] as Array<[ClothingCategory, string, number]>)('%s from %s is worth $%i', (category, brand, value) => {
    expect(valueOf({ category, brand })).toBe(value);
  });
});

describe('estimateItemValue: brand matching', () => {
  const source = (brand: unknown) => estimateItemValue(input({ brand: brand as string })).source;

  it.each([
    ['gucci'],
    ['GUCCI'],
    ['  Gucci  '],
    ['Hermès'],
    ['Hermes'],
    ["Levi's"],
    ['Levis'],
    ['LEVI’S'],
    ['H & M'],
    ['h&m'],
    ['H and M'],
    ['J. Crew'],
    ['J.Crew'],
    ['Dolce & Gabbana'],
    ['Gap Kids'],
    ['The Gap'],
    ['Polo Ralph Lauren Kids'],
    ["Arc'teryx"],
    ['Fjällräven'],
  ])('recognises "%s"', brand => {
    expect(source(brand)).toBe('brand');
  });

  it.each([
    ['Coachella'],
    ['Gaps'],
    ['Nikes'],
    ['Zaragoza'],
    ['Handmade'],
    ['Nobody Co'],
    [''],
    ['   '],
    [undefined],
    [null],
    [42],
  ])('does not mistake "%s" for a known brand', brand => {
    expect(source(brand)).toBe('category');
  });

  it('prices a collaboration by the longer, more specific brand name', () => {
    expect(valueOf({ brand: 'Nike x Off-White' })).toBe(valueOf({ brand: 'Off-White' }));
  });

  it('prices two brands of the same length by the pricier tier', () => {
    expect(valueOf({ brand: 'Adidas x Gucci' })).toBe(valueOf({ brand: 'Gucci' }));
  });

  it('a more specific name beats a shorter brand inside it', () => {
    // "Armani Exchange" is premium; plain "Armani" is designer.
    expect(valueOf({ brand: 'Armani Exchange' })).toBeLessThan(valueOf({ brand: 'Armani' }));
  });
});

describe('estimateItemValue: fabric', () => {
  it.each([
    ['name', { name: 'Cashmere sweater' }, 70],
    ['name', { name: 'Silk blouse' }, 60],
    ['name', { name: 'Wool top' }, 46],
    ['name', { name: 'Cotton tee' }, 35],
    ['name', { name: 'Polyester top' }, 30],
    ['name', { name: 'Faux leather top' }, 32],
    ['name', { name: 'Leather top' }, 60],
    ['tags', { tags: ['silk'] }, 60],
    ['material field', { material: 'cashmere' }, 70],
    ['materials list', { materials: [{ name: 'cashmere' }] }, 70],
    ['materials list', { materials: [{ name: 'Merino Wool' }] }, 49],
    ['materials list', { materials: [{ name: 'organic cotton' }] }, 35],
    ['materials list', { materials: [{ name: 'rubber' }] }, 35],
  ] as Array<[string, Partial<ValueInputs>, number]>)('read from the %s: %j is $%d', (_where, extra, value) => {
    expect(valueOf(extra)).toBe(Math.round(value));
  });

  it('is not fooled by a fabric inside another word', () => {
    expect(valueOf({ name: 'Silkworm print tee' })).toBe(35);
  });

  it('lets the materials list win over the name', () => {
    expect(valueOf({ name: 'Cashmere-look top', materials: [{ name: 'polyester' }] })).toBe(30);
  });

  it('prices a blend by its biggest share: 5% cashmere is not cashmere', () => {
    const blend = valueOf({ materials: [{ name: 'polyester', percentage: 95 }, { name: 'cashmere', percentage: 5 }] });
    expect(blend).toBe(valueOf({ materials: [{ name: 'polyester' }] }));
    expect(blend).toBeLessThan(valueOf({ materials: [{ name: 'cashmere' }] }));
  });

  it('takes the first listed fabric when no shares are given', () => {
    expect(valueOf({ materials: [{ name: 'cashmere' }, { name: 'polyester' }] })).toBe(70);
  });

  it('ignores lining, padding, soles and hardware', () => {
    expect(valueOf({ materials: [{ name: 'silk', tier: 'lining' }, { name: 'cotton', tier: 'primary' }] })).toBe(35);
    expect(
      valueOf({ category: 'shoes', materials: [{ name: 'leather', tier: 'upper' }, { name: 'cashmere', tier: 'sole' }] }),
    ).toBe(valueOf({ category: 'shoes', materials: [{ name: 'leather' }] }));
  });

  it('does not let fabric change a price the owner entered', () => {
    expect(valueOf({ cost: 40, name: 'Cashmere sweater' })).toBe(40);
  });

  it('stacks with the brand: a luxury cashmere top is worth more than a luxury cotton one', () => {
    expect(valueOf({ brand: 'Gucci', name: 'Cashmere sweater' })).toBe(630);
  });
});

describe('estimateItemValue: ordering across tiers and fabrics', () => {
  const REPRESENTATIVE = {
    luxury: 'Gucci',
    designer: 'Michael Kors',
    premium: 'Ralph Lauren',
    contemporary: 'Madewell',
    'mid-market': 'Gap',
    'fast-fashion': 'Zara',
  };

  describe.each(CLOTHING_CATEGORIES.map(category => [category]))('%s', category => {
    const at = (brand?: string) => valueOf({ category, brand });

    it('luxury > designer > premium > contemporary > mid-market > fast fashion', () => {
      const ladder = Object.values(REPRESENTATIVE).map(at);
      for (let i = 1; i < ladder.length; i++) expect(ladder[i - 1]).toBeGreaterThan(ladder[i]);
    });

    it('luxury > mid-market > fast fashion', () => {
      expect(at('Gucci')).toBeGreaterThan(at('Gap'));
      expect(at('Gap')).toBeGreaterThan(at('Zara'));
    });

    it('cashmere, silk, leather and wool are worth at least as much as cotton', () => {
      const cotton = valueOf({ category, name: 'Cotton thing' });
      for (const fabric of ['Cashmere', 'Silk', 'Leather', 'Wool']) {
        expect(valueOf({ category, name: `${fabric} thing` })).toBeGreaterThanOrEqual(cotton);
      }
    });

    it('polyester is worth no more than cotton', () => {
      expect(valueOf({ category, name: 'Polyester thing' })).toBeLessThanOrEqual(
        valueOf({ category, name: 'Cotton thing' }),
      );
    });
  });

  it('every tier has a multiplier above zero', () => {
    for (const multiplier of Object.values(TIER_MULTIPLIER)) expect(multiplier).toBeGreaterThan(0);
  });
});

describe('estimateItemValue: always a sane number', () => {
  const garbage: Array<Partial<ValueInputs>> = [
    {},
    { cost: NaN, retailCost: NaN },
    { cost: -1, retailCost: -1 },
    { cost: Infinity },
    { retailCost: Infinity },
    { cost: 1e12 },
    { retailCost: 1e12, brand: 'Gucci' },
    { cost: 0.0001 },
    { name: undefined, tags: undefined, materials: undefined },
    { name: 12 as unknown as string, tags: [1, null] as unknown as string[] },
    { materials: [null, { name: 7 }] as unknown as ValueInputs['materials'] },
    { brand: { toString: () => 'Gucci' } as unknown as string },
  ];

  it.each(garbage.map(g => [JSON.stringify(g), g]))('%s', (_label, extra) => {
    const { value } = estimateItemValue(input(extra as Partial<ValueInputs>), { matchedPrice: NaN });
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(5);
    expect(value).toBeLessThanOrEqual(50_000);
  });

  it('never goes below $5, even for the cheapest brand and category', () => {
    expect(valueOf({ category: 'hats', brand: 'Shein', name: 'Acrylic hat' })).toBeGreaterThanOrEqual(5);
  });

  it('never goes above $50,000', () => {
    expect(valueOf({ category: 'bags', brand: 'Hermes', retailCost: 10_000_000 })).toBe(50_000);
  });
});

describe('itemValue', () => {
  it('uses the value the item carries', () => {
    expect(itemValue(item({ estimatedValue: 85, valueSource: 'user', cost: 20 }))).toBe(85);
  });

  it('uses a stored estimate as it is, without working it out again', () => {
    expect(itemValue(item({ estimatedValue: 120, valueSource: 'estimate', cost: 20 }))).toBe(120);
  });

  it('keeps a value of 0 (the owner said it is worth nothing)', () => {
    expect(itemValue(item({ estimatedValue: 0, valueSource: 'user', cost: 20 }))).toBe(0);
  });

  it('keeps cents', () => {
    expect(itemValue(item({ estimatedValue: 85.5 }))).toBe(85.5);
  });

  it('works out an estimate for a row from before values existed (no estimatedValue)', () => {
    const legacy = item({ cost: 40 });
    expect(legacy.estimatedValue).toBeUndefined();
    expect(itemValue(legacy)).toBe(40);
    expect(itemValue(item({ brand: 'Gucci', category: 'bags' }))).toBe(720);
  });

  it.each([
    ['null', null],
    ['NaN', NaN],
    ['negative', -5],
    ['Infinity', Infinity],
    ['undefined', undefined],
  ])('falls back to the estimate when the stored value is %s', (_label, estimatedValue) => {
    expect(itemValue(item({ estimatedValue: estimatedValue as number | undefined, cost: 40 }))).toBe(40);
  });
});

describe('totalValue', () => {
  it('is 0 for no items', () => {
    expect(totalValue([])).toBe(0);
  });

  it('adds up each item\'s own value, estimating the ones that have none', () => {
    const items = [
      item({ estimatedValue: 100, valueSource: 'user' }),
      item({ cost: 40 }),
      item({ category: 'bags', brand: 'Gucci' }),
      item({}),
    ];
    expect(totalValue(items)).toBe(100 + 40 + 720 + 35);
  });

  it('is a plain sum of owned items once the caller leaves the wishlist out', () => {
    const all = [item({ estimatedValue: 50 }), item({ estimatedValue: 70, isWishlist: true }), item({ estimatedValue: 30 })];
    expect(totalValue(all.filter(i => !i.isWishlist))).toBe(80);
  });

  it('stays a number when an item is bad', () => {
    expect(totalValue([item({ estimatedValue: NaN, cost: NaN }), item({ estimatedValue: 10 })])).toBe(35 + 10);
  });
});

describe('formatMoney', () => {
  it.each([
    [0, '$0'],
    [5, '$5'],
    [999, '$999'],
    [1000, '$1,000'],
    [1234, '$1,234'],
    [1234.5, '$1,235'],
    [12345.49, '$12,345'],
    [123456, '$123,456'],
    [1234567, '$1,234,567'],
    [50000, '$50,000'],
    [0.4, '$0'],
    [-0.2, '$0'],
    [-1234, '-$1,234'],
    [NaN, '$0'],
    [Infinity, '$0'],
    [-Infinity, '$0'],
  ])('%p reads %s', (amount, text) => {
    expect(formatMoney(amount)).toBe(text);
  });

  it('does not depend on locale data being present', () => {
    const toLocale = jest.spyOn(Number.prototype, 'toLocaleString').mockImplementation(() => {
      throw new Error('no locale data');
    });
    try {
      expect(formatMoney(1234567)).toBe('$1,234,567');
      expect(toLocale).not.toHaveBeenCalled();
    } finally {
      toLocale.mockRestore();
    }
  });
});

describe('formatMoneyCents', () => {
  it.each([
    [0, '$0.00'],
    [12.4, '$12.40'],
    [12.345, '$12.35'],
    [0.07, '$0.07'],
    [1234567.5, '$1,234,567.50'],
    [-3.2, '-$3.20'],
    [NaN, '$0.00'],
    [Infinity, '$0.00'],
  ])('prints %p as %p', (amount, text) => {
    expect(formatMoneyCents(amount)).toBe(text);
  });
});

