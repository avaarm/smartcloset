/**
 * ItemDetails shows what the item is worth and lets the owner change it:
 * estimated or their own, an inline editor with a Done bar on the number pad,
 * and a way back to the estimate. Wishlist items have no value of their own.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { InputAccessoryView, Text, TextInput } from 'react-native';
import ItemDetailsScreen from '../../src/screens/ItemDetailsScreen';
import { updateClothingItem } from '../../src/services/storage';
import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { ClothingItem } from '../../src/types';

let mockItem: ClothingItem;

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useRoute: () => ({ params: { item: mockItem } }),
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, []),
  };
});
jest.mock('../../src/services/storage', () => ({
  getClothingItem: jest.fn(async () => mockItem),
  updateClothingItem: jest.fn(async () => undefined),
  deleteClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/wearTrackingService', () => ({
  WearTrackingService: { markItemWorn: jest.fn(), undoLastWear: jest.fn() },
}));

const mockUpdate = updateClothingItem as jest.Mock;

const makeItem = (overrides: Partial<ClothingItem> = {}): ClothingItem => ({
  id: 'item-1',
  name: 'Wool Coat',
  category: 'outerwear',
  color: 'camel',
  season: ['winter'],
  dateAdded: '2026-01-01T00:00:00.000Z',
  isWishlist: false,
  ...overrides,
});

const render = async (item: ClothingItem) => {
  mockItem = item;
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ItemDetailsScreen />);
  });
  return tree;
};

const textsOf = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

const strayText = (node: any, parentIsText = false, found: string[] = []): string[] => {
  if (node == null) return found;
  if (Array.isArray(node)) {
    node.forEach(child => strayText(child, parentIsText, found));
  } else if (typeof node === 'string') {
    if (!parentIsText) found.push(node);
  } else {
    (node.children || []).forEach((child: any) => strayText(child, node.type === 'Text', found));
  }
  return found;
};

const pressable = (tree: renderer.ReactTestRenderer, label: string) => {
  const hit = tree.root
    .findAllByType(Text)
    .find(t => [t.props.children].flat().join('') === label);
  if (!hit) throw new Error(`no "${label}" on screen`);
  let cur: renderer.ReactTestInstance | null = hit;
  while (cur && typeof cur.props.onPress !== 'function') cur = cur.parent;
  if (!cur) throw new Error(`"${label}" is not pressable`);
  return cur;
};
const press = async (tree: renderer.ReactTestRenderer, label: string) => {
  await act(async () => {
    pressable(tree, label).props.onPress();
  });
};
const edit = async (tree: renderer.ReactTestRenderer) => {
  const button = tree.root.find(n => n.props.accessibilityLabel === 'Edit value' && typeof n.props.onPress === 'function');
  await act(async () => {
    button.props.onPress();
  });
};
const type = async (tree: renderer.ReactTestRenderer, text: string) => {
  await act(async () => {
    tree.root.findByType(TextInput).props.onChangeText(text);
  });
};

beforeEach(() => {
  mockUpdate.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the Value card', () => {
  it('shows the estimate with how it was worked out', async () => {
    const texts = textsOf(await render(makeItem({ cost: 85 })));
    expect(texts).toContain('Value');
    expect(texts).toContain('$85');
    expect(texts).toContain('Estimated');
    expect(texts).toContain('From what you paid');
  });

  it('estimates an item with no price from its brand and category', async () => {
    const texts = textsOf(await render(makeItem({ name: 'Trench Coat', brand: 'Gucci' })));
    expect(texts).toContain('$810');
    expect(texts).toContain('From its brand and category');
  });

  it('shows the owner\'s own value, labelled as theirs, without the "From" hint', async () => {
    const texts = textsOf(await render(makeItem({ cost: 85, estimatedValue: 1250, valueSource: 'user' })));
    expect(texts).toContain('$1,250');
    expect(texts).toContain('Your value');
    expect(texts).not.toContain('Estimated');
    expect(texts.some(t => t.startsWith('From '))).toBe(false);
  });

  it("does not claim a source for a stored estimate a fresh estimate wouldn't reproduce (e.g. one worked out from a matched product's price)", async () => {
    // cost 200 was a listing price; the saved estimate (120) came from the matched price, not from 'paid'.
    const texts = textsOf(await render(makeItem({ cost: 200, estimatedValue: 120, valueSource: 'estimate' })));
    expect(texts).toContain('$120');
    expect(texts).toContain('Estimated');
    expect(texts.some(t => t.startsWith('From '))).toBe(false);
  });

  it('shows a stored estimate as it was stored, still labelled Estimated', async () => {
    const texts = textsOf(await render(makeItem({ cost: 85, estimatedValue: 120, valueSource: 'estimate' })));
    expect(texts).toContain('$120');
    expect(texts).toContain('Estimated');
  });

  it('is not on a wishlist item (its value is the listed price)', async () => {
    const tree = await render(makeItem({ isWishlist: true, cost: 862, retailer: '' }));
    expect(textsOf(tree)).not.toContain('Value');
    expect(textsOf(tree)).not.toContain('Estimated');
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Edit value')).toHaveLength(0);
  });

  it('puts every string inside a Text, both ways round', async () => {
    const tree = await render(makeItem({ cost: 0 }));
    expect(strayText(tree.toJSON())).toEqual([]);
    await edit(tree);
    expect(strayText(tree.toJSON())).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('editing the value', () => {
  it('opens a dollar field with the current value, on a number pad with a Done bar', async () => {
    const tree = await render(makeItem({ cost: 85 }));
    await edit(tree);

    const input = tree.root.findByType(TextInput);
    expect(input.props.value).toBe('85');
    expect(input.props.keyboardType).toBe('decimal-pad');
    expect(input.props.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
    expect(tree.root.findAllByType(InputAccessoryView).map(v => v.props.nativeID)).toContain(KEYBOARD_DONE_ID);
  });

  it('keeps the screen scrollable and tappable with the keyboard open', async () => {
    const tree = await render(makeItem({ cost: 85 }));
    const scroll = tree.root.find(n => n.props.keyboardShouldPersistTaps === 'handled');
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(true);
  });

  it('saves what was typed as the owner\'s value', async () => {
    const tree = await render(makeItem({ cost: 85 }));
    await edit(tree);
    await type(tree, '$1,250');
    await press(tree, 'Save');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-1', estimatedValue: 1250, valueSource: 'user' }),
    );
    const texts = textsOf(tree);
    expect(texts).toContain('$1,250');
    expect(texts).toContain('Your value');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('rounds to whole dollars, like everything else on screen', async () => {
    const tree = await render(makeItem({ cost: 85 }));
    await edit(tree);
    await type(tree, '99.60');
    await press(tree, 'Save');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ estimatedValue: 100 }));
  });

  it('accepts 0 (given away, or worthless)', async () => {
    const tree = await render(makeItem({ cost: 85 }));
    await edit(tree);
    await type(tree, '0');
    await press(tree, 'Save');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ estimatedValue: 0, valueSource: 'user' }));
    expect(textsOf(tree)).toContain('$0');
  });

  it('submitting from the keyboard saves too', async () => {
    const tree = await render(makeItem({ cost: 85 }));
    await edit(tree);
    await type(tree, '300');
    await act(async () => {
      tree.root.findByType(TextInput).props.onSubmitEditing();
    });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ estimatedValue: 300 }));
  });

  it.each([
    ['an empty field', ''],
    ['letters', 'abc'],
    ['more than a million dollars', '5000000'],
  ])('does not save %s and says what to enter', async (_label, text) => {
    const tree = await render(makeItem({ cost: 85 }));
    await edit(tree);
    await type(tree, text);
    await press(tree, 'Save');

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(textsOf(tree)).toContain('Enter a dollar amount, like 85.');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  });

  it('clears the message as soon as the owner types again', async () => {
    const tree = await render(makeItem({ cost: 85 }));
    await edit(tree);
    await type(tree, 'abc');
    await press(tree, 'Save');
    await type(tree, '12');
    expect(textsOf(tree)).not.toContain('Enter a dollar amount, like 85.');
  });

  it('cancel leaves the value as it was and saves nothing', async () => {
    const tree = await render(makeItem({ cost: 85 }));
    await edit(tree);
    await type(tree, '999');
    await press(tree, 'Cancel');

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(textsOf(tree)).toContain('$85');
    expect(textsOf(tree)).not.toContain('$999');
  });

  it('keeps the editor open and the old value when saving fails', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('offline'));
    const tree = await render(makeItem({ cost: 85 }));
    await edit(tree);
    await type(tree, '500');
    await press(tree, 'Save');

    expect(textsOf(tree)).toContain('Could not save the value. Please try again.');
    expect(tree.root.findByType(TextInput).props.value).toBe('500');

    await press(tree, 'Save'); // retry works
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(textsOf(tree)).toContain('$500');
  });
});

describe('going back to the estimate', () => {
  it('is offered only when the value is the owner\'s own', async () => {
    const estimated = await render(makeItem({ cost: 85 }));
    await edit(estimated);
    expect(textsOf(estimated)).not.toContain('Reset to estimate');

    const own = await render(makeItem({ cost: 85, estimatedValue: 300, valueSource: 'user' }));
    await edit(own);
    expect(textsOf(own)).toContain('Reset to estimate');
  });

  it('stores a fresh estimate as an estimate, and the card says Estimated again', async () => {
    const tree = await render(makeItem({ cost: 85, estimatedValue: 300, valueSource: 'user' }));
    await edit(tree);
    await press(tree, 'Reset to estimate');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-1', estimatedValue: 85, valueSource: 'estimate' }),
    );
    const texts = textsOf(tree);
    expect(texts).toContain('$85');
    expect(texts).toContain('Estimated');
    expect(texts).not.toContain('Your value');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });
});
