import { CLOTHING_CATEGORIES } from '../../src/utils/clothingOptions';
import {
  CLOTHING_TYPES,
  inferType,
  isKnownType,
  matchTypeTerm,
  typeLabelsFor,
} from '../../src/utils/clothingTypes';

describe('the type menu', () => {
  it('has a menu for every category, with no label repeated inside one', () => {
    for (const category of CLOTHING_CATEGORIES) {
      const labels = typeLabelsFor(category);
      expect(labels.length).toBeGreaterThan(2);
      expect(new Set(labels.map(l => l.toLowerCase())).size).toBe(labels.length);
    }
  });

  it('offers the bag and accessory kinds an owner looks for', () => {
    expect(typeLabelsFor('bags')).toEqual(expect.arrayContaining(['Handbag', 'Tote', 'Crossbody', 'Clutch', 'Backpack']));
    expect(typeLabelsFor('accessories')).toEqual(expect.arrayContaining(['Belt', 'Scarf', 'Sunglasses', 'Gloves', 'Wallet']));
    expect(typeLabelsFor('shoes')).toEqual(expect.arrayContaining(['Sneakers', 'Ankle boots', 'Heels', 'Sandals']));
    expect(typeLabelsFor('tops')).toEqual(expect.arrayContaining(['T-shirt', 'Blouse', 'Sweater', 'Hoodie']));
  });

  it('knows nothing for an unknown category', () => {
    expect(typeLabelsFor('capes')).toEqual([]);
    expect(typeLabelsFor(undefined)).toEqual([]);
  });

  it('every term of a type matches back to that type inside its own category', () => {
    for (const category of CLOTHING_CATEGORIES) {
      for (const type of CLOTHING_TYPES[category]) {
        const match = matchTypeTerm(type.label, category);
        expect(match?.label).toBe(type.label);
      }
    }
  });
});

describe('isKnownType', () => {
  it('is true for a label of that category, whatever its case', () => {
    expect(isKnownType('bags', 'Tote')).toBe(true);
    expect(isKnownType('bags', ' tote ')).toBe(true);
  });
  it('is false for another category\'s label, a custom type or nothing', () => {
    expect(isKnownType('shoes', 'Tote')).toBe(false);
    expect(isKnownType('bags', 'Doctor bag')).toBe(false);
    expect(isKnownType('bags', '')).toBe(false);
    expect(isKnownType('bags', undefined)).toBe(false);
  });
});

describe('matchTypeTerm', () => {
  it.each([
    ['knee-high boots', 'shoes', 'Knee-high boots'],
    ['Chelsea boots', 'shoes', 'Boots'],
    ['ankle booties', 'shoes', 'Ankle boots'],
    ['structured tote', 'bags', 'Tote'],
    ["Women's Andiamo shopper bag", 'bags', 'Tote'],
    ['crossbody bag', 'bags', 'Crossbody'],
    ['leather belt', 'accessories', 'Belt'],
    ['silk scarf', 'accessories', 'Scarf'],
    ['aviator sunglasses', 'accessories', 'Sunglasses'],
    ['cable knit sweater', 'tops', 'Sweater'],
    ['wide-leg jeans', 'bottoms', 'Jeans'],
    ['cocktail dress', 'dresses', 'Cocktail dress'],
    ['denim jacket', 'outerwear', 'Denim jacket'],
    ['gold hoop earrings', 'jewelry', 'Earrings'],
    ['bucket hat', 'hats', 'Bucket hat'],
    ['one-piece swimsuit', 'swimwear', 'One-piece'],
  ])('reads "%s" in %s as %s', (text, category, label) => {
    expect(matchTypeTerm(text, category as any)?.label).toBe(label);
  });

  it('lets the last noun decide, and a longer phrase beat a shorter one', () => {
    expect(matchTypeTerm('leather jacket', 'outerwear')?.label).toBe('Leather jacket');
    expect(matchTypeTerm('boot cut jeans', 'bottoms')?.label).toBe('Jeans');
  });

  it('works across categories when none is given', () => {
    expect(matchTypeTerm('red leather handbag')).toEqual({ category: 'bags', label: 'Handbag' });
    expect(matchTypeTerm('suede ankle boots')).toEqual({ category: 'shoes', label: 'Ankle boots' });
  });

  it('matches whole words only', () => {
    expect(matchTypeTerm('Flooring sample', 'jewelry')).toBeNull();
    expect(matchTypeTerm('Chat window', 'hats')).toBeNull();
    expect(matchTypeTerm('', 'bags')).toBeNull();
  });
});

describe('inferType', () => {
  it('takes the first text that names a type for the category', () => {
    expect(inferType('bags', undefined, 'Burgundy leather tote', 'handbag')).toBe('Tote');
    expect(inferType('shoes', 'knee-high boots')).toBe('Knee-high boots');
  });

  it('gives nothing rather than a wrong type', () => {
    expect(inferType('bags', 'Andiamo Large')).toBeUndefined();
    expect(inferType('shoes', 'handbag')).toBeUndefined();
    expect(inferType(undefined, 'handbag')).toBeUndefined();
  });
});
