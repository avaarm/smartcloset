/**
 * The lookup tables behind the value estimate stay complete and unambiguous, so
 * adding a brand or a category cannot quietly break the estimate.
 */
import {
  BRAND_TIERS,
  BrandTier,
  CATEGORY_BASE_PRICE,
  MATERIAL_MULTIPLIER,
  TIER_MULTIPLIER,
} from '../../src/utils/itemValueTables';
import { estimateItemValue } from '../../src/utils/itemValue';
import { CLOTHING_CATEGORIES } from '../../src/utils/clothingOptions';

const tiers = Object.keys(BRAND_TIERS) as BrandTier[];
const allBrands = tiers.flatMap(tier => BRAND_TIERS[tier].map((brand): [string, BrandTier] => [brand, tier]));

describe('brand table', () => {
  it('knows at least 150 brands', () => {
    expect(allBrands.length).toBeGreaterThanOrEqual(150);
  });

  it('has the eight tiers, each with brands and a multiplier', () => {
    expect([...tiers].sort()).toEqual(
      ['athletic', 'contemporary', 'designer', 'fast-fashion', 'luxury', 'mid-market', 'outdoor', 'premium'],
    );
    for (const tier of tiers) {
      expect(BRAND_TIERS[tier].length).toBeGreaterThan(0);
      expect(TIER_MULTIPLIER[tier]).toBeGreaterThan(0);
    }
  });

  it.each(allBrands)('"%s" is recognised, and as %s (so no brand sits in two tiers or collides with another)', (brand, tier) => {
    const { value, source } = estimateItemValue({ category: 'tops', name: 'x', brand });
    expect(source).toBe('brand');
    expect(value).toBe(Math.round(CATEGORY_BASE_PRICE.tops * TIER_MULTIPLIER[tier]));
  });
});

describe('category and fabric tables', () => {
  it('prices exactly the categories the app offers', () => {
    expect(Object.keys(CATEGORY_BASE_PRICE).sort()).toEqual([...CLOTHING_CATEGORIES].sort());
  });

  it('has a positive multiplier for every fabric, with cashmere at least cotton', () => {
    for (const multiplier of Object.values(MATERIAL_MULTIPLIER)) expect(multiplier).toBeGreaterThan(0);
    expect(MATERIAL_MULTIPLIER.cashmere).toBeGreaterThanOrEqual(MATERIAL_MULTIPLIER.cotton);
  });

  it('values faux leather below real leather', () => {
    expect(MATERIAL_MULTIPLIER['faux leather']).toBeLessThan(MATERIAL_MULTIPLIER.leather);
  });
});
