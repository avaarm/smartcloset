import { COUNTRY_NAMES, matchCountryPrefix, normalizeCountry } from '../../src/utils/countries';

describe('normalizeCountry', () => {
  it('has at least 70 production countries, each once, and each reads as itself', () => {
    expect(COUNTRY_NAMES.length).toBeGreaterThanOrEqual(70);
    expect(new Set(COUNTRY_NAMES).size).toBe(COUNTRY_NAMES.length);
    for (const name of COUNTRY_NAMES) {
      expect(normalizeCountry(name)).toEqual({ country: name, known: true });
      expect(normalizeCountry(name.toUpperCase())).toEqual({ country: name, known: true });
    }
  });

  it('maps the spellings tags use to one English name', () => {
    const cases: Array<[string, string]> = [
      ['Viet Nam', 'Vietnam'], ['VIET NAM', 'Vietnam'], ['PRC', 'China'], ['P.R.C.', 'China'], ['prc', 'China'], ["People's Republic of China", 'China'],
      ['Turkiye', 'Turkey'], ['Türkiye', 'Turkey'], ['USA', 'United States'], ['U.S.A.', 'United States'], ['U.S.', 'United States'],
      ['United States of America', 'United States'], ['the USA', 'United States'], ['Burma', 'Myanmar'], ['Korea', 'South Korea'],
      ['Republic of Korea', 'South Korea'], ['UK', 'United Kingdom'], ['England', 'United Kingdom'], ['Holland', 'Netherlands'],
      ['Czechia', 'Czech Republic'], ['Macedonia', 'North Macedonia'], ['Swaziland', 'Eswatini'], ['Hong Kong SAR', 'Hong Kong'],
    ];
    for (const [raw, country] of cases) expect(normalizeCountry(raw)).toEqual({ country, known: true });
  });

  it('reads the country in French, Spanish, German, Italian, Portuguese, Dutch, Turkish, Japanese and Chinese', () => {
    const cases: Array<[string, string]> = [
      ['Chine', 'China'], ['Italie', 'Italy'], ['Perú', 'Peru'], ['España', 'Spain'], ['Marruecos', 'Morocco'], ['Bangladesch', 'Bangladesh'],
      ['Türkei', 'Turkey'], ['Ägypten', 'Egypt'], ['Cina', 'China'], ['Turchia', 'Turkey'], ['Marrocos', 'Morocco'], ['Turkije', 'Turkey'],
      ['Hindistan', 'India'], ['中国', 'China'], ['ベトナム', 'Vietnam'], ['インドネシア', 'Indonesia'], ['越南', 'Vietnam'],
    ];
    for (const [raw, country] of cases) expect(normalizeCountry(raw)).toEqual({ country, known: true });
  });

  it('keeps an unknown country as printed, capitalised, with known false', () => {
    expect(normalizeCountry('ATLANTIS')).toEqual({ country: 'Atlantis', known: false });
    expect(normalizeCountry('new narnia')).toEqual({ country: 'New Narnia', known: false });
    expect(normalizeCountry('  ')).toEqual({ country: '', known: false });
    expect(normalizeCountry(undefined as unknown as string)).toEqual({ country: '', known: false });
  });

  it('does not take prototype names for countries', () => {
    expect(normalizeCountry('constructor').known).toBe(false);
    expect(normalizeCountry('__proto__').known).toBe(false);
  });

  it('cuts a very long unknown name', () => {
    expect(normalizeCountry('x'.repeat(200)).country.length).toBeLessThanOrEqual(60);
  });
});

describe('matchCountryPrefix', () => {
  it('finds the longest run of leading words that is a country', () => {
    expect(matchCountryPrefix(['united', 'states', 'of', 'america', 'and', 'imported'])).toEqual({ country: 'United States', used: 4 });
    expect(matchCountryPrefix(['viet', 'nam'])).toEqual({ country: 'Vietnam', used: 2 });
    expect(matchCountryPrefix(['italy', 'exclusive', 'of', 'decoration'])).toEqual({ country: 'Italy', used: 1 });
    expect(matchCountryPrefix(['bosnia', 'and', 'herzegovina'])).toEqual({ country: 'Bosnia and Herzegovina', used: 3 });
  });

  it('returns null when no leading words are a country', () => {
    expect(matchCountryPrefix(['atlantis'])).toBeNull();
    expect(matchCountryPrefix([])).toBeNull();
  });
});
