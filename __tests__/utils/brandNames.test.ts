import { brandFromText, canonicalBrand } from '../../src/utils/brandNames';

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
});
