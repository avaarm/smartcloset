import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import FilterModal, { FilterOptions } from '../../src/components/FilterModal';

const NONE: FilterOptions = { categories: [], seasons: [], sortBy: 'date', sortOrder: 'desc' };

let tree: renderer.ReactTestRenderer;

const mount = async (filters: FilterOptions = NONE) => {
  const onApplyFilters = jest.fn();
  const onClose = jest.fn();
  await act(async () => {
    tree = renderer.create(
      <FilterModal visible onClose={onClose} onApplyFilters={onApplyFilters} currentFilters={filters} />,
    );
  });
  return { onApplyFilters, onClose };
};

const chip = (label: string) => {
  const found = tree.root.findAll(
    n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label,
  );
  if (found.length === 0) throw new Error(`no chip labelled "${label}"`);
  return found[0];
};

/** A chip without an accessibility label is found by the text it shows. */
const chipByText = (text: string) => {
  const texts = tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.children === text);
  const label = texts[0];
  let node: any = label;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  if (!node) throw new Error(`no chip showing "${text}"`);
  return node;
};

const isOn = (node: any): boolean => !!node.props.accessibilityState?.selected;
const press = async (node: any) => act(async () => node.props.onPress());
const apply = async () => act(async () => chipByText('Apply Filters').props.onPress());

afterEach(() => {
  act(() => tree?.unmount());
});

describe('categories', () => {
  it('offers all eleven categories by name, plus All', async () => {
    await mount();
    for (const label of [
      'Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes',
      'Bags', 'Jewelry', 'Hats', 'Activewear', 'Swimwear', 'Accessories',
    ]) {
      expect(chipByText(label)).toBeDefined();
    }
    expect(chip('All categories')).toBeDefined();
  });

  it('shows All as selected when nothing is, and not otherwise', async () => {
    await mount();
    expect(isOn(chip('All categories'))).toBe(true);

    await press(chipByText('Bags'));
    expect(isOn(chip('All categories'))).toBe(false);
    expect(isOn(chipByText('Bags'))).toBe(true);
  });

  it('All clears the chosen categories', async () => {
    const { onApplyFilters } = await mount({ ...NONE, categories: ['shoes', 'bags'] });
    expect(isOn(chip('All categories'))).toBe(false);

    await press(chip('All categories'));
    expect(isOn(chip('All categories'))).toBe(true);
    expect(isOn(chipByText('Shoes'))).toBe(false);
    expect(isOn(chipByText('Bags'))).toBe(false);

    await apply();
    expect(onApplyFilters).toHaveBeenCalledWith(expect.objectContaining({ categories: [] }));
  });

  it('passes the new category ids through to the wardrobe filter', async () => {
    const { onApplyFilters } = await mount();
    await press(chipByText('Jewelry'));
    await press(chipByText('Hats'));
    await apply();
    expect(onApplyFilters).toHaveBeenCalledWith(expect.objectContaining({ categories: ['jewelry', 'hats'] }));
  });
});

describe('seasons', () => {
  it('has an All chip that is on when no season is chosen', async () => {
    await mount();
    expect(isOn(chip('All seasons'))).toBe(true);
    await press(chipByText('winter'));
    expect(isOn(chip('All seasons'))).toBe(false);
    expect(isOn(chipByText('winter'))).toBe(true);
  });

  it('All clears the chosen seasons without touching the categories', async () => {
    const { onApplyFilters } = await mount({ ...NONE, categories: ['tops'], seasons: ['fall', 'winter'] });
    await press(chip('All seasons'));
    await apply();
    expect(onApplyFilters).toHaveBeenCalledWith(
      expect.objectContaining({ categories: ['tops'], seasons: [] }),
    );
  });
});

describe('reset', () => {
  it('goes back to All in both groups', async () => {
    const { onApplyFilters } = await mount({ ...NONE, categories: ['tops'], seasons: ['fall'] });
    await act(async () => chipByText('Reset').props.onPress());
    expect(onApplyFilters).toHaveBeenCalledWith({ categories: [], seasons: [], sortBy: 'date', sortOrder: 'desc' });
    expect(isOn(chip('All categories'))).toBe(true);
    expect(isOn(chip('All seasons'))).toBe(true);
  });
});
