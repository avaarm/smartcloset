/**
 * The phrases the photo analysis hands to inferType (the model's sub-category, Vision's labels, a listing title)
 * and the item type each lands on. The menu itself is tested with clothingTypes; this holds the wordings that real
 * answers used and that did not map before ("sleeveless dress" came back from the model for a red dress and was
 * left without a type).
 */
import { inferType, matchTypeTerm } from '../../src/utils/clothingTypes';

describe('inferType on what the model and Vision call things', () => {
  // [category, what it was called, type shown]
  const table: Array<[Parameters<typeof inferType>[0], string, string]> = [
    ['dresses', 'sleeveless dress', 'Casual dress'],
    ['dresses', 'shift dress', 'Casual dress'],
    ['dresses', 'skater dress', 'Casual dress'],
    ['dresses', 'pinafore', 'Casual dress'],
    ['dresses', 'wedding dress', 'Evening gown'],
    ['dresses', 'cocktail dress', 'Cocktail dress'],
    ['tops', 'henley', 'Shirt'],
    ['tops', 'knit sweater', 'Sweater'],
    ['tops', 'hooded sweatshirt', 'Hoodie'],
    ['outerwear', 'cloak', 'Cape'],
    ['outerwear', 'duster coat', 'Coat'],
    ['outerwear', 'hooded jacket', 'Jacket'],
    ['shoes', 'high-top sneakers', 'Sneakers'],
    ['shoes', 'hi-top', 'Sneakers'],
    ['shoes', 'tennis shoe', 'Sneakers'],
    ['shoes', 'hiking boots', 'Boots'],
    ['shoes', 'chukka', 'Boots'],
    ['shoes', 'over-the-knee boots', 'Knee-high boots'],
    ['shoes', 'high-heeled shoe', 'Heels'],
    ['shoes', 'court shoe', 'Pumps'],
    ['bags', 'messenger', 'Crossbody'],
    ['bags', 'saddle bag', 'Crossbody'],
    ['bags', 'pochette', 'Clutch'],
    ['accessories', 'neckerchief', 'Scarf'],
    ['accessories', 'cravat', 'Tie'],
  ];

  it.each(table)('%s: "%s" is %s', (category, text, expected) => {
    expect(inferType(category, text)).toBe(expected);
  });

  it('still leaves a type out rather than guess: a bare "dress" or "shoe" names no type on the menu', () => {
    expect(inferType('dresses', 'dress')).toBeUndefined();
    expect(inferType('shoes', 'shoe')).toBeUndefined();
    expect(inferType('bags', 'bag')).toBeUndefined();
  });

  it('finds the type of an item the category was corrected to', () => {
    // The model filed a hoodie under outerwear; in tops the same words find it.
    expect(inferType('outerwear', 'hoodie')).toBeUndefined();
    expect(inferType('tops', 'hoodie')).toBe('Hoodie');
    expect(matchTypeTerm('hoodie')?.category).toBe('tops');
  });
});
