/**
 * The sizes offered for each kind of piece. `size` stays one short string on the item ("M", "8", "US 9.5",
 * "W30 L32", "One size"), so nothing is stored differently and older items keep working; the picker only
 * saves the person typing. A size outside these lists is still allowed: the picker has a field for it.
 */

import type { ClothingCategory } from '../types/clothing';

export interface SizeGroup {
  /** Shown above the chips ("Letter", "Numeric", "Shoe (US)"). */
  label: string;
  sizes: readonly string[];
}

const LETTER: SizeGroup = { label: 'Letter', sizes: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] };
const NUMERIC: SizeGroup = { label: 'Numeric (US)', sizes: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18'] };
const WAIST: SizeGroup = {
  label: 'Waist (in)',
  sizes: ['24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '36', '38', '40'],
};
const SHOE_US: SizeGroup = {
  label: 'Shoe (US)',
  sizes: ['5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13'],
};
const SHOE_EU: SizeGroup = {
  label: 'Shoe (EU)',
  sizes: ['EU 35', 'EU 36', 'EU 37', 'EU 38', 'EU 39', 'EU 40', 'EU 41', 'EU 42', 'EU 43', 'EU 44', 'EU 45'],
};
const HAT: SizeGroup = { label: 'Hat', sizes: ['S', 'M', 'L', 'XL', 'S/M', 'L/XL'] };
const ONE_SIZE: SizeGroup = { label: 'One size', sizes: ['One size'] };

const GROUPS: Record<ClothingCategory, readonly SizeGroup[]> = {
  tops: [LETTER, NUMERIC],
  dresses: [LETTER, NUMERIC],
  outerwear: [LETTER, NUMERIC],
  activewear: [LETTER, NUMERIC],
  swimwear: [LETTER, NUMERIC],
  bottoms: [LETTER, NUMERIC, WAIST],
  shoes: [SHOE_US, SHOE_EU],
  hats: [HAT, ONE_SIZE],
  bags: [ONE_SIZE, { label: 'Size', sizes: ['Mini', 'Small', 'Medium', 'Large'] }],
  jewelry: [ONE_SIZE, { label: 'Ring (US)', sizes: ['5', '6', '7', '8', '9', '10'] }],
  accessories: [ONE_SIZE, LETTER],
};

/** The groups of chips to offer for a category; a category the app does not know gets letter sizes and one size. */
export const sizeGroupsFor = (category: ClothingCategory | string | undefined): readonly SizeGroup[] =>
  (category && (GROUPS as Record<string, readonly SizeGroup[]>)[category]) || [LETTER, ONE_SIZE];

/** What the size is called for a category, for the section's hint ("Shoe size", "Size"). */
export const sizeNoun = (category: ClothingCategory | string | undefined): string =>
  category === 'shoes' ? 'Shoe size' : category === 'bottoms' ? 'Size or waist' : 'Size';

/** True when the text is one of the offered chips for the category (case-insensitive), so the picker can light it. */
export const isOfferedSize = (category: ClothingCategory | string | undefined, size: string): boolean => {
  const wanted = size.trim().toLowerCase();
  return !!wanted && sizeGroupsFor(category).some(g => g.sizes.some(s => s.toLowerCase() === wanted));
};
