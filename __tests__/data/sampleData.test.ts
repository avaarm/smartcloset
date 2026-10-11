/**
 * The sample wardrobe, wishlist and outfits a guest starts with. They are the first
 * thing an App Store reviewer or a new user sees, so every photo has to show what the
 * item's name says: no photo shared by two items, no item whose category contradicts
 * its own name, and no outfit that names an item that is not there.
 */
import { enhancedClothingItems, enhancedOutfits } from '../../src/data/enhancedSampleData';
import { sampleWishlistItems } from '../../src/services/seedDemoData';
import { categoryFromText } from '../../src/utils/clothingCategories';
import { CLOTHING_CATEGORIES } from '../../src/utils/clothingOptions';

const wardrobe = enhancedClothingItems;
const wishlist = sampleWishlistItems();
const everything = [...wardrobe, ...(wishlist as typeof wardrobe)];

describe('sample items', () => {
  it('have an id of their own', () => {
    const ids = wardrobe.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const wishIds = wishlist.map(i => i.id);
    expect(new Set(wishIds).size).toBe(wishIds.length);
  });

  it('have a photo of their own: no two items share one', () => {
    const photos = everything.map(i => i.retailerImage);
    expect(photos.every(p => typeof p === 'string' && p.startsWith('https://'))).toBe(true);
    const shared = photos.filter((p, i) => photos.indexOf(p) !== i);
    expect(shared).toEqual([]);
  });

  it('have a name of their own', () => {
    const names = everything.map(i => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('are in a real category that agrees with what their name calls them', () => {
    for (const item of everything) {
      expect(CLOTHING_CATEGORIES).toContain(item.category);
      const named = categoryFromText(item.name);
      if (named) expect([item.name, item.category]).toEqual([item.name, named]);
    }
  });

  it('have a colour, a brand and a season', () => {
    for (const item of everything) {
      expect(item.color).toBeTruthy();
      expect(item.brand).toBeTruthy();
      expect((item.season ?? []).length).toBeGreaterThan(0);
    }
  });

  it('are wardrobe pieces or wishes, not both', () => {
    expect(wardrobe.every(i => i.isWishlist === false)).toBe(true);
    expect(wishlist.every(i => i.isWishlist === true)).toBe(true);
  });

  it('cover the kinds of thing a wardrobe holds', () => {
    const categories = new Set(everything.map(i => i.category));
    for (const c of ['tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'bags', 'jewelry', 'hats', 'accessories']) {
      expect(categories).toContain(c);
    }
  });
});

describe('sample wishlist prices', () => {
  it('give every wish a new price and a lower used price', () => {
    for (const wish of wishlist) {
      expect(wish.retailCost).toBeGreaterThan(0);
      expect(wish.cost).toBeGreaterThan(0);
      expect(wish.cost!).toBeLessThan(wish.retailCost!);
    }
  });
});

describe('sample outfits', () => {
  const ids = new Set(wardrobe.map(i => i.id));

  it('only name items that exist', () => {
    for (const outfit of enhancedOutfits) {
      for (const id of outfit.items) expect(ids).toContain(id);
    }
  });

  it('keep at least two pieces each, so every one is still seeded', () => {
    for (const outfit of enhancedOutfits) expect(outfit.items.length).toBeGreaterThanOrEqual(2);
  });
});
