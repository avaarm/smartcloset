/**
 * Wardrobe search: every word of the search has to be found somewhere on the item, a word
 * matches the start of a word on the item, plurals do not matter, and "men" is never "women".
 */
import {
  buildSearchIndex,
  itemMatchesSearch,
  searchTokens,
  searchWardrobe,
  wordsOf,
} from '../../src/utils/wardrobeSearch';
import type { ClothingItem } from '../../src/types';

let n = 0;
const item = (over: Partial<ClothingItem> = {}): ClothingItem => ({
  id: `id-${++n}`,
  name: 'Item',
  category: 'tops',
  color: 'white',
  season: [],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...over,
});

const jacket = item({
  name: 'Biker jacket',
  brand: 'AllSaints',
  color: 'black',
  category: 'outerwear',
  subcategory: 'Leather jacket',
  materials: [{ name: 'leather', tier: 'primary' }],
  tags: ['edgy', 'boho'],
});

const find = (items: ClothingItem[], query: string) => searchWardrobe(buildSearchIndex(items), query).map(i => i.name);

describe('wordsOf', () => {
  it('lower-cases and splits on spaces, punctuation and hyphens', () => {
    expect(wordsOf('High-Waisted Jeans, (Blue)')).toEqual(['high', 'waisted', 'jeans', 'blue']);
  });

  it('drops accents and apostrophes, so women\'s is womens', () => {
    expect(wordsOf("Women's Hermès")).toEqual(['womens', 'hermes']);
    expect(wordsOf('Women’s')).toEqual(['womens']);
  });

  it('keeps a decimal size whole', () => {
    expect(wordsOf('EU 38.5')).toEqual(['eu', '38.5']);
    expect(wordsOf('6-8')).toEqual(['6', '8']);
  });

  it('reads a dotted brand both as one word and as its parts', () => {
    expect(wordsOf('J.Crew')).toEqual(['jcrew', 'j', 'crew']);
    expect(wordsOf('Inc.')).toEqual(['inc']);
  });

  it('gives nothing for blank or missing text', () => {
    expect(wordsOf('   ')).toEqual([]);
    expect(wordsOf(undefined)).toEqual([]);
    expect(wordsOf(null)).toEqual([]);
  });
});

describe('searchTokens', () => {
  it('drops the words that only join a search, except the one being typed', () => {
    expect(searchTokens('black and white striped dress')).toEqual(['black', 'white', 'striped', 'dress']);
    expect(searchTokens('dolce and')).toEqual(['dolce', 'and']);
    expect(searchTokens('the')).toEqual(['the']);
  });

  it('ignores punctuation and extra spaces', () => {
    expect(searchTokens('  black,   leather!! ')).toEqual(['black', 'leather']);
    expect(searchTokens('--')).toEqual([]);
  });
});

describe('searchWardrobe', () => {
  it('finds the item that has every word, wherever the words are', () => {
    const items = [
      jacket,
      item({ name: 'Black tee' }),
      item({ name: 'Brown leather bag', color: 'brown', category: 'bags' }),
    ];
    expect(find(items, 'black leather jacket')).toEqual(['Biker jacket']);
    expect(find(items, 'leather')).toEqual(['Biker jacket', 'Brown leather bag']);
    expect(find(items, 'black')).toEqual(['Biker jacket', 'Black tee']);
  });

  it('needs every word: one that is nowhere on the item rules it out', () => {
    expect(find([jacket], 'black leather jacket red')).toEqual([]);
    expect(find([jacket], 'black leather boots')).toEqual([]);
  });

  it('does not care about the order of the words or their case', () => {
    expect(find([jacket], 'JACKET Leather BLACK')).toEqual(['Biker jacket']);
  });

  it('finds a blank search everywhere, in the original order', () => {
    const items = [item({ name: 'B' }), item({ name: 'A' })];
    expect(find(items, '')).toEqual(['B', 'A']);
    expect(find(items, '   ')).toEqual(['B', 'A']);
    expect(find(items, '!!')).toEqual(['B', 'A']);
  });

  it('matches the start of a word, so a half-typed word still finds it', () => {
    expect(find([jacket], 'jack')).toEqual(['Biker jacket']);
    expect(find([jacket], 'leat blac')).toEqual(['Biker jacket']);
    expect(find([jacket], 'acket')).toEqual([]);
  });

  it('ignores plurals in both directions', () => {
    const items = [
      item({ name: 'Denim jackets' }),
      item({ name: 'Wrap dress' }),
      item({ name: 'Ankle boot', category: 'shoes' }),
      item({ name: 'Silk blouses' }),
    ];
    expect(find(items, 'jacket')).toEqual(['Denim jackets']);
    expect(find(items, 'jackets')).toEqual(['Denim jackets']);
    expect(find(items, 'dresses')).toEqual(['Wrap dress']);
    expect(find(items, 'boots')).toEqual(['Ankle boot']);
    expect(find(items, 'blouse')).toEqual(['Silk blouses']);
  });

  it('finds a plural-only word such as jeans from its singular', () => {
    const items = [item({ name: 'Straight jeans', category: 'bottoms' })];
    expect(find(items, 'jean')).toEqual(['Straight jeans']);
    expect(find(items, 'jeans')).toEqual(['Straight jeans']);
  });

  describe('whole words', () => {
    const items = [item({ name: "Women's wrap top" }), item({ name: "Men's oxford shirt" }), item({ name: 'Wool coat' })];

    it('never reads men as women', () => {
      expect(find(items, 'men')).toEqual(["Men's oxford shirt"]);
      expect(find(items, "men's")).toEqual(["Men's oxford shirt"]);
      expect(find(items, 'women')).toEqual(["Women's wrap top"]);
      expect(find(items, 'womens')).toEqual(["Women's wrap top"]);
    });

    it('does not find a word in the middle of another', () => {
      expect(find(items, 'ool')).toEqual([]);
      expect(find(items, 'rap')).toEqual([]);
    });
  });

  describe('each field', () => {
    const fields: Array<[string, Partial<ClothingItem>, string]> = [
      ['name', { name: 'Zebra jumper' }, 'zebra'],
      ['brand', { brand: 'Stella McCartney' }, 'mccartney'],
      ['a brand written as one word', { brand: 'Louis Vuitton' }, 'louisvuitton'],
      ['a brand with an ampersand', { brand: 'H&M' }, 'hm'],
      ['a dotted brand', { brand: 'J.Crew' }, 'crew'],
      ['color', { color: 'burgundy' }, 'burgundy'],
      ['category label', { category: 'outerwear' }, 'outerwear'],
      ['category label, singular', { category: 'bags' }, 'bag'],
      ['type', { subcategory: 'Chelsea boots' }, 'chelsea'],
      ['tags', { tags: ['boho', 'casual'] }, 'boho'],
      ['a tag that is a style word', { tags: ['casual'] }, 'casual'],
      ['retailer', { retailer: 'Nordstrom' }, 'nordstrom'],
      ['size', { size: 'XL' }, 'xl'],
      ['a decimal size', { size: '8.5' }, '8.5'],
      ['the word size, with a size set', { size: 'M' }, 'size m'],
      ['condition', { condition: 'like_new' }, 'like new'],
      ['condition, new with tags', { condition: 'new_with_tags' }, 'tags'],
      ['condition, well loved', { condition: 'well_loved' }, 'loved'],
      ['materials', { materials: [{ name: 'cashmere' }, { name: 'silk', tier: 'lining' }] }, 'silk'],
      ['the main material', { material: 'denim' }, 'denim'],
      ['pattern', { pattern: 'polka_dot' }, 'polka'],
      ['occasion', { occasion: 'formal' }, 'formal'],
      ['seasons', { season: ['spring', 'summer'] }, 'summer'],
      ['fall as autumn', { season: ['fall'] }, 'autumn'],
      ['care instructions', { careInstructions: ['Machine wash cold', 'Do not bleach'] }, 'bleach'],
      ['country of origin', { originCountry: 'Portugal' }, 'portugal'],
      ['notes', { notes: 'Bought on holiday in Lisbon' }, 'lisbon'],
    ];

    it.each(fields)('finds an item by its %s, and not an item without it', (_label, over, query) => {
      const target = item({ color: 'grey', ...over });
      const decoy = item({ name: 'Decoy', color: 'grey', category: 'shoes' });
      expect(searchWardrobe(buildSearchIndex([decoy, target]), query)).toEqual([target]);
      expect(itemMatchesSearch(target, query)).toBe(true);
      expect(itemMatchesSearch(decoy, query)).toBe(false);
    });
  });

  it('does not find a season the item is not for, or "size" on an item with none', () => {
    const summerTee = item({ name: 'Tee', season: ['summer'] });
    expect(itemMatchesSearch(summerTee, 'winter')).toBe(false);
    expect(itemMatchesSearch(item({ name: 'Tee' }), 'size')).toBe(false);
  });

  it('reads an old "all seasons" item as every season', () => {
    expect(itemMatchesSearch(item({ name: 'Tee', season: ['all' as any] }), 'winter')).toBe(true);
  });

  it('finds an item from words spread over several fields, as people type them', () => {
    const boots = item({
      name: 'Boots',
      brand: 'Coach',
      color: 'tan',
      category: 'shoes',
      subcategory: 'Ankle boots',
      size: '8',
      condition: 'good',
      season: ['fall', 'winter'],
    });
    expect(itemMatchesSearch(boots, 'coach tan ankle boots size 8')).toBe(true);
    expect(itemMatchesSearch(boots, 'tan shoes fall good')).toBe(true);
    expect(itemMatchesSearch(boots, 'tan shoes spring')).toBe(false);
  });

  it('copes with items that have none of the optional fields', () => {
    const bare = { id: 'x', name: 'Bare', category: 'tops', color: '', season: undefined, dateAdded: '', isWishlist: false } as any;
    expect(itemMatchesSearch(bare, 'bare')).toBe(true);
    expect(itemMatchesSearch(bare, 'bare leather')).toBe(false);
  });

  it('copes with a category from old data that is not one of ours', () => {
    expect(itemMatchesSearch(item({ category: 'footwear' as any }), 'footwear')).toBe(true);
  });

  it('keeps the original objects, so a result is the very item that was indexed', () => {
    const items = [jacket, item({ name: 'Other' })];
    expect(searchWardrobe(buildSearchIndex(items), 'jacket')[0]).toBe(jacket);
  });

  it('stays fast over a wardrobe of a thousand items', () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      item({
        name: `Piece ${i} ${i % 2 ? 'linen shirt' : 'wool coat'}`,
        brand: `Brand${i % 40}`,
        color: i % 3 ? 'blue' : 'olive',
        tags: ['casual', 'boho'],
        notes: 'Bought in a small shop and worn only a few times, dry clean only',
        careInstructions: ['Machine wash cold', 'Tumble dry low', 'Do not bleach'],
        materials: [{ name: 'linen' }, { name: 'cotton' }],
        size: 'M',
        season: ['spring', 'summer'],
      }),
    );
    const started = Date.now();
    const index = buildSearchIndex(many);
    const built = Date.now() - started;
    const searchStarted = Date.now();
    for (let i = 0; i < 20; i++) searchWardrobe(index, 'blue linen shirt casual');
    const searched = Date.now() - searchStarted;
    expect(searchWardrobe(index, 'blue linen shirt casual').length).toBeGreaterThan(0);
    // Generous bounds: they only catch an accidental quadratic walk.
    expect(built).toBeLessThan(2000);
    expect(searched / 20).toBeLessThan(200);
  });
});
