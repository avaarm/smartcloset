import type { ClothingCategory } from '../../src/types/clothing';
import { analyzeVision } from '../../src/services/recognitionFusion';
import {
  categoryFromText,
  matchCategoryTerm,
  refineCategory,
  CATEGORY_NOUN,
} from '../../src/utils/clothingCategories';
import { CLOTHING_CATEGORIES } from '../../src/utils/clothingOptions';

describe('categoryFromText', () => {
  // [label, category]
  const table: Array<[string, ClothingCategory]> = [
    // shoes: every kind goes to shoes, never accessories
    ['Boot', 'shoes'],
    ['Boots', 'shoes'],
    ['Knee-high boots', 'shoes'],
    ['Chelsea boot', 'shoes'],
    ['Ankle boot', 'shoes'],
    ['Sneakers', 'shoes'],
    ['Running shoe', 'shoes'],
    ['High heels', 'shoes'],
    ['Loafer', 'shoes'],
    ['Loafers', 'shoes'],
    ['Ballet flat', 'shoes'],
    ['Flats', 'shoes'],
    ['Sandal', 'shoes'],
    ['Sandals', 'shoes'],
    ['Slippers', 'shoes'],
    ['Mary jane', 'shoes'],
    ['Shoe', 'shoes'],
    ['Footwear', 'shoes'],
    ['Dress shoe', 'shoes'],
    // bags
    ['Handbag', 'bags'],
    ['Purse', 'bags'],
    ['Tote bag', 'bags'],
    ['Tote', 'bags'],
    ['Clutch', 'bags'],
    ['Backpack', 'bags'],
    ['Satchel', 'bags'],
    ['Shoulder bag', 'bags'],
    ['Crossbody bag', 'bags'],
    ['Bag', 'bags'],
    ['Luggage and bags', 'bags'],
    // jewelry
    ['Necklace', 'jewelry'],
    ['Earrings', 'jewelry'],
    ['Ring', 'jewelry'],
    ['Bracelet', 'jewelry'],
    ['Watch', 'jewelry'],
    ['Wristwatch', 'jewelry'],
    ['Jewellery', 'jewelry'],
    // hats
    ['Hat', 'hats'],
    ['Cap', 'hats'],
    ['Baseball cap', 'hats'],
    ['Beanie', 'hats'],
    ['Beret', 'hats'],
    ['Sun hat', 'hats'],
    ['Top hat', 'hats'],
    ['Headgear', 'hats'],
    // activewear
    ['Leggings', 'activewear'],
    ['Sports bra', 'activewear'],
    ['Yoga pants', 'activewear'],
    ['Activewear', 'activewear'],
    ['Sportswear', 'activewear'],
    // swimwear
    ['Bikini', 'swimwear'],
    ['Bikini top', 'swimwear'],
    ['Swimsuit', 'swimwear'],
    ['Swim trunks', 'swimwear'],
    ['Trunks', 'swimwear'],
    ['Swimwear', 'swimwear'],
    // accessories
    ['Belt', 'accessories'],
    ['Scarf', 'accessories'],
    ['Scarves', 'accessories'],
    ['Gloves', 'accessories'],
    ['Sunglasses', 'accessories'],
    ['Glasses', 'accessories'],
    ['Necktie', 'accessories'],
    ['Socks', 'accessories'],
    ['Fashion accessory', 'accessories'],
    // clothing
    ['T-shirt', 'tops'],
    ['Blouse', 'tops'],
    ['Sweater', 'tops'],
    ['Hoodie', 'tops'],
    ['Tank top', 'tops'],
    ['Top', 'tops'],
    ['Polo shirt', 'tops'],
    ['Dress shirt', 'tops'],
    ['Jeans', 'bottoms'],
    ['Shorts', 'bottoms'],
    ['Skirt', 'bottoms'],
    ['Trousers', 'bottoms'],
    ['Dress pants', 'bottoms'],
    ['Boot cut jeans', 'bottoms'],
    ['Dress', 'dresses'],
    ['Cocktail dress', 'dresses'],
    ['Gown', 'dresses'],
    ['Jumpsuit', 'dresses'],
    ['Jacket', 'outerwear'],
    ['Leather jacket', 'outerwear'],
    ['Coat', 'outerwear'],
    ['Trench coat', 'outerwear'],
    ['Blazer', 'outerwear'],
    ['Outerwear', 'outerwear'],
  ];

  it.each(table)('%s is %s', (label, category) => {
    expect(categoryFromText(label)).toBe(category);
  });

  it('is case and punctuation insensitive', () => {
    expect(categoryFromText('KNEE-HIGH BOOTS')).toBe('shoes');
    expect(categoryFromText('  tote   bag ')).toBe('bags');
  });

  // Words that merely contain a clothing word, or scene and material labels, name no category.
  it.each([
    'Flooring', 'Floor', 'Hardwood', 'Wood stain', 'Chat', 'Desktop', 'Hatchback', 'Tie dye', 'Key ring',
    'Ring light', 'Cap toe', 'Clothing', 'Fashion', 'Sleeve', 'Textile', 'Pattern', 'Leather', 'Suede',
    'Mannequin', 'Boutique', 'Beltway', 'Spring', 'Bagel', '',
  ])('%j names no category', label => {
    expect(categoryFromText(label)).toBeUndefined();
  });

  it('lets the last noun decide when a label names several things', () => {
    expect(categoryFromText('Leather jacket')).toBe('outerwear');
    expect(categoryFromText('Denim jacket')).toBe('outerwear');
    expect(categoryFromText('Boot cut jeans')).toBe('bottoms');
    expect(categoryFromText('Dress shoe')).toBe('shoes');
    expect(categoryFromText('Shoe bag')).toBe('bags');
  });

  it('covers every category', () => {
    const covered = new Set(table.map(([, c]) => c));
    for (const c of CLOTHING_CATEGORIES) expect(covered.has(c)).toBe(true);
  });
});

describe('matchCategoryTerm', () => {
  it('rates how specific a label is, so "Footwear" and "Fashion accessory" say less than "Boot"', () => {
    expect(matchCategoryTerm('Boot')).toMatchObject({ category: 'shoes', specificity: 3, nameable: true });
    expect(matchCategoryTerm('Footwear')).toMatchObject({ category: 'shoes', specificity: 2, nameable: false });
    expect(matchCategoryTerm('Fashion accessory')).toMatchObject({ category: 'accessories', specificity: 1, nameable: false });
    // "Shoe" and "Bag" are generic but still read well as an item type.
    expect(matchCategoryTerm('Shoe')).toMatchObject({ nameable: true });
    expect(matchCategoryTerm('Bag')).toMatchObject({ nameable: true });
  });

  it('reports the matched term for naming', () => {
    expect(matchCategoryTerm('Knee-high boots')?.phrase).toBe('knee-high boot');
    expect(matchCategoryTerm('Boot cut jeans')?.phrase).toBe('jeans');
  });
});

describe('refineCategory', () => {
  // [category the model gave, its sub-category, result]
  const table: Array<[ClothingCategory | undefined, string | undefined, ClothingCategory | undefined]> = [
    ['accessories', 'structured tote', 'bags'],
    ['accessories', 'knee-high boots', 'shoes'],
    ['accessories', 'baseball cap', 'hats'],
    ['accessories', undefined, 'accessories'],
    ['shoes', 'tote', 'bags'],
    ['tops', 'bikini top', 'swimwear'],
    ['tops', 'sports bra', 'activewear'],
    ['tops', 'sweater', 'tops'],
    ['outerwear', 'sock', 'outerwear'],
    [undefined, 'sneaker', 'shoes'],
    [undefined, undefined, undefined],
    ['shoes', 'unobtainium', 'shoes'],
  ];

  it.each(table)('%s + %s = %s', (category, subtype, expected) => {
    expect(refineCategory(category, subtype)).toBe(expected);
  });
});

describe('CATEGORY_NOUN', () => {
  it('has a noun for every category', () => {
    for (const c of CLOTHING_CATEGORIES) expect(CATEGORY_NOUN[c]).toBeTruthy();
  });
});

// ─── From a whole Google Vision response ─────────────────────────────────────

const box = (x0: number, y0: number, x1: number, y1: number) => ({
  normalizedVertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
});

const vision = (
  labels: Array<[string, number]>,
  objects: Array<[string, number, ReturnType<typeof box>]> = [],
) =>
  analyzeVision({
    labelAnnotations: labels.map(([description, score]) => ({ description, score })),
    localizedObjectAnnotations: objects.map(([name, score, boundingPoly]) => ({ name, score, boundingPoly })),
  });

describe('the category Vision\'s labels add up to', () => {
  it('a specific label beats the generic ones (Boot over Footwear, Fashion accessory and Leather)', () => {
    const v = vision([['Fashion accessory', 0.99], ['Footwear', 0.97], ['Leather', 0.95], ['Shoe', 0.9], ['Boot', 0.8]]);

    expect(v.result.category).toBe('shoes');
    expect(v.result.subtype).toBe('boot');
  });

  it('the generic labels alone still land in the right group', () => {
    expect(vision([['Footwear', 0.97], ['Leather', 0.9]]).result.category).toBe('shoes');
    expect(vision([['Luggage and bags', 0.9], ['Fashion accessory', 0.9]]).result.category).toBe('bags');
  });

  it('a fashion-accessory label never turns shoes or bags into accessories', () => {
    expect(vision([['Fashion accessory', 0.99], ['Sneakers', 0.7]]).result.category).toBe('shoes');
    expect(vision([['Fashion accessory', 0.99], ['Handbag', 0.7]]).result.category).toBe('bags');
    expect(vision([['Fashion accessory', 0.99], ['Necklace', 0.7]]).result.category).toBe('jewelry');
    expect(vision([['Fashion accessory', 0.99], ['Sun hat', 0.7]]).result.category).toBe('hats');
  });

  it('the genuinely generic "Fashion accessory" photo is an accessory, with low confidence', () => {
    const v = vision([['Fashion accessory', 0.99], ['Textile', 0.8]]);

    expect(v.result.category).toBe('accessories');
    expect(v.result.confidence.category).toBeLessThan(0.4);
  });

  it('a surface label does not read as clothing (Flooring is not a ring)', () => {
    const v = vision([['Flooring', 0.98], ['Floor', 0.96], ['Hardwood', 0.9], ['Wood stain', 0.8]]);

    expect(v.result.category).toBeUndefined();
    expect(v.result.rawLabels).toEqual([]);
    expect(v.backgroundLabels).toEqual(['Flooring', 'Floor', 'Hardwood', 'Wood stain']);
  });

  it('is only as confident as its evidence: one source never reports 97%', () => {
    const strong = vision(
      [['Boot', 0.99], ['Shoe', 0.99], ['Footwear', 0.99]],
      [['Boot', 0.95, box(0, 0, 1, 1)]],
    );

    expect(strong.result.confidence.category).toBeLessThanOrEqual(0.85);
  });

  it('is less confident when the labels split between categories', () => {
    const agree = vision([['Handbag', 0.9], ['Bag', 0.9]]);
    const split = vision([['Handbag', 0.9], ['Dress', 0.88], ['Boot', 0.85]]);

    expect(split.result.confidence.category as number).toBeLessThan(agree.result.confidence.category as number);
  });
});

describe('picking the main item from several', () => {
  it('goes by the largest, most certain object: boots over the flats beside them', () => {
    const v = vision(
      [['Boot', 0.9], ['Footwear', 0.95], ['Ballet flat', 0.7]],
      [['Boot', 0.83, box(0, 0, 0.6, 0.65)], ['Shoe', 0.7, box(0.25, 0.55, 0.6, 0.85)]],
    );

    expect(v.mainItem).toBe('Boot');
    expect(v.result.category).toBe('shoes');
    expect(v.result.subtype).toBe('boot');
  });

  it('chooses the dress a woman wears over the bag she carries', () => {
    const v = vision(
      [['Clothing', 0.95], ['Dress', 0.9], ['Handbag', 0.8], ['Footwear', 0.7]],
      [
        ['Dress', 0.9, box(0.2, 0.1, 0.8, 0.8)],
        ['Handbag', 0.8, box(0.7, 0.5, 0.9, 0.65)],
        ['Shoe', 0.6, box(0.3, 0.85, 0.45, 0.95)],
      ],
    );

    expect(v.mainItem).toBe('Dress');
    expect(v.result.category).toBe('dresses');
  });

  it('chooses the bag when it fills the frame even if a stray shoe label scores higher', () => {
    const v = vision(
      [['Shoe', 0.9], ['Handbag', 0.85]],
      [['Handbag', 0.9, box(0.05, 0.05, 0.95, 0.95)], ['Shoe', 0.5, box(0.8, 0.8, 0.9, 0.9)]],
    );

    expect(v.mainItem).toBe('Handbag');
  });

  it('has no main item when nothing was localised', () => {
    expect(vision([['Boot', 0.9]]).mainItem).toBeUndefined();
  });
});

describe('every category, from a one-label photo', () => {
  const photos: Array<[ClothingCategory, string]> = [
    ['tops', 'T-shirt'],
    ['bottoms', 'Jeans'],
    ['dresses', 'Dress'],
    ['outerwear', 'Jacket'],
    ['shoes', 'Sneakers'],
    ['bags', 'Handbag'],
    ['jewelry', 'Necklace'],
    ['hats', 'Beanie'],
    ['activewear', 'Leggings'],
    ['swimwear', 'Bikini'],
    ['accessories', 'Sunglasses'],
  ];

  it.each(photos)('%s from "%s"', (category, label) => {
    const v = vision([[label, 0.9]]);

    expect(v.result.category).toBe(category);
    expect(v.result.confidence.category).toBeGreaterThan(0.5);
  });

  it('covers all eleven', () => {
    expect(photos.map(([c]) => c).sort()).toEqual([...CLOTHING_CATEGORIES].sort());
  });
});
