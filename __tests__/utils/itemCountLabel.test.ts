import { itemCountLabel } from '../../src/utils/itemCountLabel';

describe('itemCountLabel', () => {
  it('pluralises the total', () => {
    expect(itemCountLabel(0)).toBe('0 items');
    expect(itemCountLabel(1)).toBe('1 item');
    expect(itemCountLabel(2)).toBe('2 items');
  });

  it('shows how many of the total are visible when some are hidden', () => {
    expect(itemCountLabel(12, 3)).toBe('3 of 12 items');
    expect(itemCountLabel(12, 12)).toBe('12 of 12 items');
    expect(itemCountLabel(1, 0)).toBe('0 of 1 item');
  });
});
