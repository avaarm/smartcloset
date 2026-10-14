import { brandFromText, canonicalBrand } from '../../src/utils/brandNames';
import { brandKeyRaw } from '../../src/utils/brandKey';
import { BRAND_TIERS } from '../../src/utils/itemValueTables';

describe('brandFromText', () => {
  it('finds a known brand in a product title', () => {
    expect(brandFromText("Women's Small Andiamo in Lava red Bottega Veneta")).toBe('Bottega Veneta');
    expect(brandFromText('Nike Air Force 1 07')).toBe('Nike');
    expect(brandFromText('Oscar de la Renta Embroidered Cocktail Dress')).toBe('Oscar de la Renta');
    expect(brandFromText('Dries Van Noten Leather Heels')).toBe('Dries Van Noten');
  });

  it('prefers the longer name when one holds another', () => {
    expect(brandFromText('Christian Louboutin So Kate pumps')).toBe('Christian Louboutin');
  });

  it('finds nothing in a title with no brand, or for empty input', () => {
    expect(brandFromText('Red leather tote bag')).toBeUndefined();
    expect(brandFromText('')).toBeUndefined();
    expect(brandFromText(undefined)).toBeUndefined();
  });

  it('matches whole words, not pieces of other words', () => {
    expect(brandFromText('Coachella festival tote')).toBeUndefined();
  });
});

describe('canonicalBrand', () => {
  it('spells a known brand the way it writes itself', () => {
    expect(canonicalBrand('Bottegaveneta')).toBe('Bottega Veneta');
    expect(canonicalBrand('bottega-veneta')).toBe('Bottega Veneta');
    expect(canonicalBrand('GUCCI')).toBe('Gucci');
  });

  it('returns an unknown brand as typed, trimmed', () => {
    expect(canonicalBrand('  Some Small Label ')).toBe('Some Small Label');
  });

  it('is empty for nothing', () => {
    expect(canonicalBrand(undefined)).toBe('');
    expect(canonicalBrand('  ')).toBe('');
  });

  it('reaches an accented brand from its plain spelling, and the other way round', () => {
    expect(canonicalBrand('Hermes')).toBe('Hermès');
    expect(canonicalBrand('HERMES')).toBe('Hermès');
    expect(canonicalBrand('Hermès')).toBe('Hermès');
    expect(canonicalBrand('Fjallraven')).toBe('Fjällräven');
    expect(canonicalBrand('fjällräven')).toBe('Fjällräven');
    expect(canonicalBrand('Sezane')).toBe('Sézane');
  });

  it('still treats "&" as "and"', () => {
    expect(canonicalBrand('Ba and sh')).toBe('Ba&sh');
    expect(canonicalBrand('Ba&sh')).toBe('Ba&sh');
  });

  it('does not merge any two known names that were apart before accents were folded', () => {
    const before = (name: string) => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
    const byKey = new Map<string, Set<string>>();
    for (const name of Object.values(BRAND_TIERS).flat()) {
      const key = brandKeyRaw(name);
      if (!key) continue;
      byKey.set(key, (byKey.get(key) ?? new Set()).add(name));
    }
    // "L.L.Bean" and "LL Bean" are one brand written twice in the list; they shared a key before too.
    const newlyMerged = [...byKey.entries()]
      .filter(([, names]) => new Set([...names].map(before)).size > 1)
      .map(([key, names]) => `${key}: ${[...names].join(' / ')}`);
    expect(newlyMerged).toEqual([]);
  });
});
