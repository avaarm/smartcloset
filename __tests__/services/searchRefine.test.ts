/**
 * Refining a photo's answer with words: the photo's best guess plus what was typed becomes a
 * text search. A colour typed replaces the colour guessed, words are not repeated, and the
 * search's product noun stays last.
 */
import { mergeRefineWords, headFamily, refineSuggestions } from '../../src/services/searchRanking';
import { buildRefinedSearch } from '../../src/services/lensSearchService';

describe('mergeRefineWords', () => {
  it('puts the typed words in front of the best guess', () => {
    expect(mergeRefineWords('ankle boots', 'black leather')).toBe('black leather ankle boots');
    expect(mergeRefineWords('ankle boots', 'Coach')).toBe('Coach ankle boots');
  });

  it('is just the typed words when there is no best guess', () => {
    expect(mergeRefineWords('', 'burgundy clutch')).toBe('burgundy clutch');
    expect(mergeRefineWords('   ', 'burgundy clutch')).toBe('burgundy clutch');
  });

  it('replaces the colour of the best guess with a colour typed', () => {
    expect(mergeRefineWords('tan ankle boots', 'black')).toBe('black ankle boots');
    expect(mergeRefineWords('Coach brown leather satchel', 'burgundy')).toBe('burgundy Coach leather satchel');
  });

  it('takes the shade along with the colour it replaces', () => {
    expect(mergeRefineWords('dark brown ankle boots', 'black')).toBe('black ankle boots');
    expect(mergeRefineWords('off white dress', 'black')).toBe('black dress');
  });

  it('keeps the colour of the best guess when the words typed have none', () => {
    expect(mergeRefineWords('tan ankle boots', 'leather')).toBe('leather tan ankle boots');
  });

  it('does not repeat a word the best guess already has, plurals included', () => {
    expect(mergeRefineWords('black ankle boots', 'black leather')).toBe('black leather ankle boots');
    expect(mergeRefineWords('ankle boots', 'boot')).toBe('ankle boots');
    expect(mergeRefineWords('tan boots', 'tan')).toBe('tan boots');
  });

  it('keeps the noun the best guess ends on at the end when the words typed repeat it', () => {
    expect(mergeRefineWords('ankle boots', 'chelsea boots')).toBe('chelsea ankle boots');
    expect(mergeRefineWords('leather bag', 'tote bags')).toBe('tote leather bag');
  });

  it('does not repeat a word typed twice', () => {
    expect(mergeRefineWords('boots', 'Suede suede')).toBe('Suede boots');
  });

  it('keeps the best guess\'s product noun last, so a typed noun cannot change what is searched for', () => {
    const merged = mergeRefineWords('ankle boots', 'heel');
    expect(merged).toBe('heel ankle boots');
    expect(headFamily(merged)).toBe('boots');
  });

  it('gives nothing when nothing usable was typed', () => {
    expect(mergeRefineWords('ankle boots', '')).toBe('');
    expect(mergeRefineWords('ankle boots', '   ')).toBe('');
    expect(mergeRefineWords('ankle boots', '"" ()')).toBe('');
  });

  it('keeps search operators out, as for any typed search', () => {
    expect(mergeRefineWords('ankle boots', '-gucci site:ebay.com')).toBe('gucci site ebay.com ankle boots');
  });

  it('stays within the length a search is allowed', () => {
    const typed = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    expect(mergeRefineWords('boots', typed).split(' ').length).toBeLessThanOrEqual(20);
  });
});

describe('buildRefinedSearch', () => {
  const photo = (query: string, labels: string[] = [query]) => ({ query, bestGuessLabels: labels });

  it('searches the photo\'s query plus the words, with the category read from them', () => {
    expect(buildRefinedSearch(photo('ankle boots'), 'black leather')).toEqual({
      query: 'black leather ankle boots',
      options: { category: 'shoes' },
    });
  });

  it('names the brand when the words or the best guess hold a known one', () => {
    const fromWords = buildRefinedSearch(photo('leather satchel'), 'Coach black');
    expect(fromWords?.query).toBe('Coach black leather satchel');
    expect(fromWords?.options).toEqual({ category: 'bags', brand: 'Coach' });

    const fromGuess = buildRefinedSearch(photo('Gucci loafers'), 'black');
    expect(fromGuess?.options.brand).toBe('Gucci');
  });

  it('falls back to the first label when the photo has no query', () => {
    expect(buildRefinedSearch(photo('', ['denim jacket', 'jacket']), 'cropped')).toEqual({
      query: 'cropped denim jacket',
      options: { category: 'outerwear' },
    });
  });

  it('is just the words when the photo named nothing, such as a photo that failed', () => {
    expect(buildRefinedSearch(photo('', []), 'burgundy clutch')).toEqual({
      query: 'burgundy clutch',
      options: { category: 'bags' },
    });
  });

  it('leaves out the options it cannot read, rather than passing undefined', () => {
    const result = buildRefinedSearch(photo(''), 'vintage');
    expect(result).toEqual({ query: 'vintage', options: {} });
    expect(Object.keys(result!.options)).toEqual([]);
  });

  it('is null when nothing usable was typed', () => {
    expect(buildRefinedSearch(photo('ankle boots'), '')).toBeNull();
    expect(buildRefinedSearch(photo('ankle boots'), '  ')).toBeNull();
  });
});

describe('refineSuggestions', () => {
  const titles = [
    'Black leather ankle boots',
    'Black suede chelsea boots',
    'Brown leather boots',
    'Tan leather boots',
    'Vintage black boots',
    'Plain boots',
  ];

  it('offers colours, materials and styles the results share, most common first', () => {
    expect(refineSuggestions(titles, 'boots')).toEqual(['black', 'leather']);
  });

  it('does not offer what the search already says, plural or not', () => {
    expect(refineSuggestions(titles, 'black boots')).toEqual(['leather']);
    expect(refineSuggestions(titles, 'leathers')).toEqual(['black']);
  });

  it('skips a word every result has, since it would narrow nothing, and a word only one result has', () => {
    expect(refineSuggestions(['Black leather boots', 'Black suede boots', 'Black boots'], 'boots')).toEqual([]);
    expect(refineSuggestions(['Black boots', 'Brown boots', 'Plain boots'], 'boots')).toEqual([]);
  });

  it('breaks a tie in the order colours, materials, styles', () => {
    expect(
      refineSuggestions(['Vintage leather black boots', 'Vintage leather black clogs', 'Plain mules'], 'x'),
    ).toEqual(['black', 'leather', 'vintage']);
  });

  it('offers at most as many as asked for', () => {
    const many = Array.from({ length: 3 }, () => 'black red blue green pink leather suede vintage boots');
    many.push('Plain boots');
    expect(refineSuggestions(many, 'boots', 3)).toHaveLength(3);
    expect(refineSuggestions(many, 'boots')).toHaveLength(6);
  });

  it('shows a material as it is written, and ignores words inside other words', () => {
    expect(refineSuggestions(['Canvas tote', 'Canvas bag', 'Tank top', 'Tan skirt'], 'x')).toEqual(['canvas']);
  });

  it('offers nothing for no results', () => {
    expect(refineSuggestions([], 'boots')).toEqual([]);
  });
});
