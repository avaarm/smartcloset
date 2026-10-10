import { generateNameFromRecognition, type RecognitionResult } from '../../src/services/imageRecognition';

const result = (over: Partial<RecognitionResult>): RecognitionResult => ({ confidence: {}, isReal: true, ...over });

describe('generateNameFromRecognition', () => {
  // [what was recognised, the name]
  const table: Array<[string, Partial<RecognitionResult>, string]> = [
    ['the screenshot boots', { color: 'tan', material: 'suede', subtype: 'knee-high boots', category: 'shoes' }, 'Tan Suede Knee-High Boots'],
    ['a type Vision named singular', { color: 'tan', material: 'suede', subtype: 'boot', category: 'shoes' }, 'Tan Suede Boots'],
    ['a brand, colour and type', { brand: 'Gucci', color: 'black', subtype: 'jacket' }, 'Gucci Black Jacket'],
    ['a bag by a designer', { brand: 'Bottega Veneta', color: 'brown', material: 'leather', subtype: 'structured tote', category: 'bags' }, 'Bottega Veneta Brown Leather Structured Tote'],
    ['a type that repeats the colour', { color: 'black', subtype: 'black leather jacket', material: 'leather' }, 'Black Leather Jacket'],
    ['a type that repeats the brand', { brand: 'Nike', color: 'white', subtype: 'nike sneakers' }, 'Nike White Sneakers'],
    ['a fibre that would only clutter a name', { color: 'navy', material: 'cotton', subtype: 'shirt' }, 'Navy Shirt'],
    ['a pattern the type does not mention', { color: 'navy', pattern: 'striped', subtype: 'shirt' }, 'Navy Striped Shirt'],
    ['a pattern the type already mentions', { color: 'navy', pattern: 'striped', subtype: 'striped shirt' }, 'Navy Striped Shirt'],
    ['a polka-dot pattern word', { color: 'red', pattern: 'polka_dot', subtype: 'skirt' }, 'Red Polka Dot Skirt'],
    ['a solid pattern, which is no news', { color: 'red', pattern: 'solid', subtype: 'skirt' }, 'Red Skirt'],
    ['a multicolour item', { color: 'multicolor', subtype: 'handbag' }, 'Multicolor Handbag'],
    ['a pair of flats', { color: 'black', material: 'leather', subtype: 'ballet flat' }, 'Black Leather Ballet Flats'],
    ['leggings', { color: 'black', subtype: 'legging' }, 'Black Leggings'],
    ['earrings', { color: 'gold', subtype: 'earring' }, 'Gold Earrings'],
    ['already plural', { color: 'blue', subtype: 'jeans' }, 'Blue Jeans'],
    ['only a category', { color: 'tan', category: 'shoes' }, 'Tan Shoes'],
    ['only a category of the newer kind', { category: 'bags' }, 'Bag'],
    ['a hyphenated type', { color: 'tan', subtype: 'over-the-knee boots' }, 'Tan Over-The-Knee Boots'],
    ['a pattern that says nothing', { color: 'tan', material: 'suede', pattern: 'other', subtype: 'ankle boots' }, 'Tan Suede Ankle Boots'],
    ['a pattern that says nothing, on a bag', { color: 'brown', material: 'leather', pattern: 'other', subtype: 'handbag' }, 'Brown Leather Handbag'],
    ['the generic Graphics label', { color: 'black', pattern: 'graphic', category: 'tops' }, 'Black Top'],
    ['a colour guessed from pixels alone', { color: 'white', confidence: { color: 0.35 }, subtype: 'sunglasses' }, 'Sunglasses'],
    ['a colour sure enough to fill in', { color: 'black', confidence: { color: 0.4 }, subtype: 'sunglasses' }, 'Black Sunglasses'],
    ['a brand and colour but no idea what the item is', { brand: 'Puma', color: 'green', material: 'wool' }, ''],
    ['nothing', {}, ''],
  ];

  it.each(table)('%s', (_what, over, expected) => {
    expect(generateNameFromRecognition(result(over))).toBe(expected);
  });

  it('never repeats a word', () => {
    const words = generateNameFromRecognition(
      result({ brand: 'Tan', color: 'tan', material: 'suede', subtype: 'tan suede suede boots' }),
    ).toLowerCase().split(' ');

    expect(new Set(words).size).toBe(words.length);
  });
});
