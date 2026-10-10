/**
 * What is sent to the web search: the person's words cleaned of operator
 * syntax, a category noun for short searches, `-site:` for the main resale
 * hosts, everything under the length limits. For a photo, the query is built
 * from brand + colour + product type, not from a pile of labels.
 */
import {
  BRAVE_QUERY_MAX,
  BRAVE_QUERY_MAX_WORDS,
  COMPACT_QUERY_MAX,
  SEARCH_RESULT_COUNT,
  brandCandidates,
  buildBraveQuery,
  deriveImageQuery,
  sanitizeQueryText,
} from '../../src/services/searchRanking';
import { RESALE_QUERY_EXCLUSIONS } from '../../src/services/retailerDomains';

const words = (s: string) => s.split(/\s+/).filter(Boolean);

describe('sanitizeQueryText', () => {
  it('keeps plain words', () => {
    expect(sanitizeQueryText('  tan   suede  boots ')).toBe('tan suede boots');
    expect(sanitizeQueryText("women's chelsea boot")).toBe("women's chelsea boot");
  });

  it('removes search-operator syntax so typing it cannot change what we ask for', () => {
    expect(sanitizeQueryText('boots site:ebay.com')).toBe('boots site ebay.com');
    expect(sanitizeQueryText('-gucci +prada boots')).toBe('gucci prada boots');
    expect(sanitizeQueryText('"tan boots" OR sneakers AND NOT heels')).toBe('tan boots sneakers heels');
    expect(sanitizeQueryText('(boots)')).toBe('boots');
    expect(sanitizeQueryText('--- :::')).toBe('');
  });

  it('bounds the length', () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
    const out = sanitizeQueryText(long);
    expect(words(out).length).toBeLessThanOrEqual(20);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(sanitizeQueryText('x'.repeat(500)).length).toBeLessThanOrEqual(160);
  });
});

describe('buildBraveQuery', () => {
  it('sends the cleaned words, then -site: for the main resale hosts', () => {
    const built = buildBraveQuery('tan boots', { excludeResale: true });
    expect(built.text).toBe('tan boots');
    expect(built.q.startsWith('tan boots -site:ebay.com -site:poshmark.com -site:depop.com')).toBe(true);
    expect(built.excluded.length).toBeGreaterThan(8);
    expect(built.q).toBe(['tan boots', ...built.excluded.map(h => `-site:${h}`)].join(' '));
  });

  it('adds no exclusions unless asked, and none to an empty query', () => {
    expect(buildBraveQuery('tan boots')).toEqual({ q: 'tan boots', text: 'tan boots', excluded: [] });
    expect(buildBraveQuery('tan boots', { excludeResale: false }).q).toBe('tan boots');
    expect(buildBraveQuery('', { excludeResale: true }).q).toBe('');
    expect(buildBraveQuery(' :: ', { excludeResale: true }).q).toBe('');
  });

  it('stays under the length cap and the word cap, for the full and the compact limit', () => {
    for (const max of [BRAVE_QUERY_MAX, COMPACT_QUERY_MAX]) {
      const text = Array.from({ length: 20 }, (_, i) => `longword${i}`).join(' ');
      const built = buildBraveQuery(text, { excludeResale: true, maxLength: max });
      expect(built.q.length).toBeLessThanOrEqual(max);
      expect(words(built.q).length).toBeLessThanOrEqual(BRAVE_QUERY_MAX_WORDS);
      // Whatever fits is whole hosts, never half of one.
      for (const term of words(built.q).filter(w => w.startsWith('-site:'))) {
        expect(RESALE_QUERY_EXCLUSIONS).toContain(term.slice('-site:'.length));
      }
    }
  });

  it('drops the least common exclusions first when space is short', () => {
    const full = buildBraveQuery('tan boots', { excludeResale: true, maxLength: BRAVE_QUERY_MAX });
    const compact = buildBraveQuery('tan boots', { excludeResale: true, maxLength: COMPACT_QUERY_MAX });
    expect(compact.excluded.length).toBeLessThan(full.excluded.length);
    expect(compact.excluded).toEqual(full.excluded.slice(0, compact.excluded.length));
    expect(compact.excluded.slice(0, 3)).toEqual(['ebay.com', 'poshmark.com', 'depop.com']);
  });

  it('fits all of the default exclusions in the full limit for an ordinary search', () => {
    const built = buildBraveQuery('burgundy leather clutch', { excludeResale: true });
    expect(built.excluded).toEqual([...RESALE_QUERY_EXCLUSIONS]);
    expect(built.q.length).toBeLessThanOrEqual(BRAVE_QUERY_MAX);
  });

  it('never lets what the person typed add exclusions or operators of its own', () => {
    const built = buildBraveQuery('boots -site:nordstrom.com NOT site:zara.com', { excludeResale: true });
    expect(built.text).toBe('boots site nordstrom.com site zara.com');
    expect(built.q).not.toContain('-site:nordstrom.com');
    expect(built.q).not.toMatch(/\bNOT\b/);
  });

  it('adds the category noun to a short search that names no product', () => {
    expect(buildBraveQuery('bottega', { category: 'bags' }).text).toBe('bottega bag');
    expect(buildBraveQuery('tan', { category: 'shoes' }).text).toBe('tan shoes');
    expect(buildBraveQuery('gucci', { category: 'jewelry' }).text).toBe('gucci jewelry');
  });

  it('leaves a search that already names a product, or a long one, alone', () => {
    expect(buildBraveQuery('tan boots', { category: 'shoes' }).text).toBe('tan boots');
    expect(buildBraveQuery('tan suede knee high', { category: 'shoes' }).text).toBe('tan suede knee high');
    expect(buildBraveQuery('bottega', {}).text).toBe('bottega');
    expect(buildBraveQuery('bottega', { category: 'accessories' }).text).toBe('bottega');
  });

  it('asks for many results and states the limits the proxy has to accept', () => {
    expect(SEARCH_RESULT_COUNT).toBeGreaterThanOrEqual(30);
    expect(BRAVE_QUERY_MAX).toBe(400);
    expect(BRAVE_QUERY_MAX_WORDS).toBe(50);
    expect(COMPACT_QUERY_MAX).toBe(200);
  });
});

describe('deriveImageQuery: brand + colour + product type', () => {
  it('builds the query from what was detected', () => {
    expect(deriveImageQuery({ color: 'tan', subtype: 'knee-high boots', category: 'shoes' })).toBe('tan knee-high boots');
    expect(deriveImageQuery({ brand: 'Bottega Veneta', color: 'brown', subtype: 'shopper bag' })).toBe(
      'Bottega Veneta brown shopper bag',
    );
  });

  it('does not repeat a word the product type already says', () => {
    expect(deriveImageQuery({ color: 'tan', subtype: 'tan suede boots' })).toBe('tan suede boots');
    expect(deriveImageQuery({ brand: 'Gucci', subtype: 'gucci loafers' })).toBe('gucci loafers');
  });

  it('uses the category noun when there is no product type', () => {
    expect(deriveImageQuery({ color: 'red', category: 'bags' })).toBe('red bag');
    expect(deriveImageQuery({ category: 'swimwear' })).toBe('swimsuit');
  });

  it('falls back to the web\'s best guess, then to the one label that names a product, never all the labels', () => {
    expect(deriveImageQuery({ bestGuess: 'tan suede boots' })).toBe('tan suede boots');
    expect(deriveImageQuery({ labels: ['Clothing', 'Footwear', 'Tan', 'Boot', 'Fashion', 'Shoe'] })).toBe('Tan Boot');
    expect(deriveImageQuery({ labels: ['Clothing', 'Fashion', 'Pattern'] })).toBe('');
    expect(deriveImageQuery({})).toBe('');
  });

  it('prefers the detected product type over the best guess', () => {
    expect(deriveImageQuery({ subtype: 'ankle boots', bestGuess: 'best shoes for fall 2026 tutorial' })).toBe('ankle boots');
  });

  it('keeps operator syntax out of a detected value', () => {
    expect(deriveImageQuery({ brand: '-gucci', subtype: 'boots site:ebay.com' })).toBe('gucci boots site ebay.com');
  });
});

describe('brandCandidates', () => {
  it('offers single words and neighbouring pairs, not colours or product words', () => {
    const out = brandCandidates('bottega veneta tan boots');
    expect(out).toEqual(expect.arrayContaining(['bottega', 'veneta', 'bottega veneta']));
    expect(out).not.toContain('tan');
    expect(out).not.toContain('boots');
  });

  it('puts the detected brand in', () => {
    expect(brandCandidates('tan boots', 'Stuart Weitzman')).toContain('Stuart Weitzman');
  });
});
