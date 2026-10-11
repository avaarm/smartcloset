import { mapDbToClothingItem } from '../../src/services/storage';

describe('the item type column', () => {
  const row = { id: '1', name: 'Tote', category: 'bags', season: [], is_wishlist: false };

  it('reads the type from the row', () => {
    expect(mapDbToClothingItem({ ...row, subcategory: 'Tote' }).subcategory).toBe('Tote');
  });

  it('reads a row with no type (every row from before it existed) as having none', () => {
    expect(mapDbToClothingItem(row).subcategory).toBeUndefined();
    expect(mapDbToClothingItem({ ...row, subcategory: null }).subcategory).toBeUndefined();
    expect(mapDbToClothingItem({ ...row, subcategory: '' }).subcategory).toBeUndefined();
  });
});
