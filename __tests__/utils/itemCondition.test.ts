import {
  ITEM_CONDITIONS,
  ITEM_CONDITION_LABELS,
  cleanCareInstructions,
  cleanSize,
  conditionLabel,
  isItemCondition,
} from '../../src/utils/itemCondition';

describe('item condition', () => {
  it('has a label for each stored value, from new to well loved', () => {
    expect(ITEM_CONDITIONS).toEqual(['new_with_tags', 'like_new', 'good', 'well_loved']);
    expect(ITEM_CONDITIONS.map(c => ITEM_CONDITION_LABELS[c])).toEqual(['New with tags', 'Like new', 'Good', 'Well loved']);
  });
  it('recognises only the stored values', () => {
    expect(isItemCondition('like_new')).toBe(true);
    for (const v of ['Like new', 'broken', '', null, undefined, 3]) expect(isItemCondition(v)).toBe(false);
  });
  it('labels a stored value and gives nothing for anything else', () => {
    expect(conditionLabel('good')).toBe('Good');
    expect(conditionLabel('nope')).toBe('');
    expect(conditionLabel(undefined)).toBe('');
  });
});

describe('cleanSize', () => {
  it('trims, joins whitespace and keeps at most 20 characters', () => {
    expect(cleanSize('  M ')).toBe('M');
    expect(cleanSize('EU   38\n')).toBe('EU 38');
    expect(cleanSize('x'.repeat(40))).toHaveLength(20);
  });
  it('is empty for nothing', () => {
    expect(cleanSize(undefined)).toBe('');
    expect(cleanSize('   ')).toBe('');
  });
});

describe('cleanCareInstructions', () => {
  it('trims, drops blanks and repeats (ignoring case), and keeps the first spelling', () => {
    expect(cleanCareInstructions([' Machine wash cold ', '', 'machine wash cold', 'Do not bleach'])).toEqual([
      'Machine wash cold',
      'Do not bleach',
    ]);
  });
  it('caps a line at 80 characters and the list at 20 lines', () => {
    expect(cleanCareInstructions(['y'.repeat(200)])[0]).toHaveLength(80);
    expect(cleanCareInstructions(Array.from({ length: 40 }, (_, i) => `line ${i}`))).toHaveLength(20);
  });
  it('is empty for nothing', () => {
    expect(cleanCareInstructions(undefined)).toEqual([]);
    expect(cleanCareInstructions(null)).toEqual([]);
  });
});
