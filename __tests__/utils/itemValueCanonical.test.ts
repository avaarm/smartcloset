/**
 * The estimate falls back to the canonical fibre of a material name only when the existing phrase lookup finds nothing,
 * so every name the lookup already knew keeps its old value and a few names that used to count as 1 now count as their fibre.
 */
import { estimateItemValue } from '../../src/utils/itemValue';
import { CATEGORY_BASE_PRICE, MATERIAL_MULTIPLIER } from '../../src/utils/itemValueTables';
import type { MaterialComponent } from '../../src/types';

const valueOf = (materials: MaterialComponent[]) =>
  estimateItemValue({ category: 'tops', name: 'Piece', materials }).value;
const withName = (name: string, extra: Partial<MaterialComponent> = {}) => valueOf([{ name, tier: 'primary', percentage: 100, ...extra }]);
const priced = (multiplier: number) => Math.round(CATEGORY_BASE_PRICE.tops * multiplier);

describe('names the phrase lookup already knows keep their old value', () => {
  it.each([
    ['vegan leather', 0.9], ['faux leather', 0.9], ['pleather', 0.9], ['shearling', 1.8], ['velvet', 1.15], ['canvas', 0.95],
    ['merino', 1.4], ['denim', 1],
  ])('%s is %s', (name, multiplier) => {
    expect(withName(name)).toBe(priced(multiplier));
    expect(MATERIAL_MULTIPLIER[name]).toBe(multiplier);
  });

  it('values a name that holds a known phrase by that phrase, as before', () => {
    expect(withName('organic cotton')).toBe(priced(1));
    expect(withName('merino wool')).toBe(priced(1.4));
    expect(withName('Italian leather')).toBe(priced(1.7));
    expect(withName('Faux Leather')).toBe(priced(0.9));
  });
});

describe('names that used to fall through to 1 are valued like their fibre', () => {
  it.each([
    ['polyamide', 0.9], ['elastan', 0.9], ['poly', 0.85], ['lambswool', 1.3], ['flax', 1.1], ['manmade', 0.85], ['man made', 0.85],
    ['recycled polyamide', 0.9], ['Polyamide', 0.9],
  ])('%s is %s', (name, multiplier) => {
    expect(withName(name)).toBe(priced(multiplier));
  });
});

describe('fibres with no neighbour in the table stay at 1', () => {
  it.each(['lyocell', 'modal', 'cupro', 'polyurethane', 'tencel', 'down', 'feathers', 'textile', 'hemp', 'unobtainium', ''])('%j', name => {
    expect(withName(name)).toBe(priced(1));
  });
});

describe('the rest of the estimate is unchanged', () => {
  it('values the biggest share of the shell, and ignores lining, soles and hardware', () => {
    expect(valueOf([{ name: 'polyamide', tier: 'primary', percentage: 70 }, { name: 'cotton', tier: 'primary', percentage: 30 }])).toBe(priced(0.9));
    expect(valueOf([{ name: 'cotton', tier: 'primary', percentage: 30 }, { name: 'polyamide', tier: 'primary', percentage: 70 }])).toBe(priced(0.9));
    expect(valueOf([{ name: 'cotton', tier: 'primary', percentage: 100 }, { name: 'polyamide', tier: 'lining' }])).toBe(priced(1));
    expect(valueOf([{ name: 'polyamide', tier: 'lining', percentage: 100 }])).toBe(priced(1));
  });

  it('still reads the material text of an item with no components', () => {
    expect(estimateItemValue({ category: 'tops', name: 'Cashmere sweater' }).value).toBe(priced(2));
    expect(estimateItemValue({ category: 'tops', name: 'Piece', materials: [] }).value).toBe(priced(1));
  });

  it('survives a material of the wrong shape', () => {
    expect(() => valueOf([{ name: undefined as unknown as string, tier: 'primary' }])).not.toThrow();
    expect(valueOf([{ name: 'constructor', tier: 'primary' }])).toBe(priced(1));
    expect(valueOf([{ name: '__proto__', tier: 'primary' }])).toBe(priced(1));
  });
});
