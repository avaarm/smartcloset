/**
 * Add / Edit Item and the keyboard: the keyboard must not hide the field being
 * typed in or the Save button, and number pads and the notes box (which have no
 * Return key) get a Done bar to close the keyboard with.
 */
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: null }, error: null })) } },
}));
jest.mock('../../src/services/storage', () => ({
  saveClothingItem: jest.fn(async () => undefined),
  updateClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/imageStorage', () => ({
  copyImageToPermanentStorage: jest.fn(async (uri: string) => uri),
}));
jest.mock('../../src/platform/fileSystem', () => ({
  readImageAsBase64: jest.fn(async () => 'base64-photo'),
}));
jest.mock('../../src/services/authUser', () => ({
  getAuthUserId: jest.fn(async () => 'user-1'),
}));
jest.mock('../../src/services/productContributions', () => ({
  lookupKnowledgeBase: jest.fn(async () => []),
  recordContribution: jest.fn(async () => undefined),
}));

import 'react-native';
import React from 'react';
import { InputAccessoryView, Keyboard, ScrollView, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import AddClothingScreen from '../../src/screens/AddClothingScreen';
import MaterialsEditor from '../../src/components/MaterialsEditor';
import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { saveClothingItem } from '../../src/services/storage';

const save = saveClothingItem as jest.Mock;

let tree: renderer.ReactTestRenderer;
const flush = () =>
  act(async () => {
    await new Promise(r => setImmediate(r));
  });

const render = async (params: any = {}) => {
  await act(async () => {
    tree = renderer.create(<AddClothingScreen navigation={{ goBack: jest.fn() } as any} route={{ params }} />);
  });
  await flush();
};

const inputs = () => tree.root.findAllByType(TextInput);
const field = (placeholder: string) => inputs().find(i => i.props.placeholder === placeholder)!;
const textNodes = (root: renderer.ReactTestInstance, label: string) =>
  root.findAll(n => (n.type as unknown) === 'Text' && n.props.children === label);

/** The input's native text field, whose focus() the Return key should call. */
const focusCalls = () => ((TextInput as any).prototype.focus as jest.Mock).mock.contexts;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    tree?.unmount();
  });
  jest.restoreAllMocks();
});

describe('Done bar', () => {
  it('is rendered once, and every number-pad, decimal-pad and multi-line input uses it', async () => {
    await render();
    // The % field of a material only exists once a material row is added.
    const addMaterial = textNodes(tree.root, 'Add material')[0];
    let pressable: any = addMaterial;
    while (pressable && typeof pressable.props.onPress !== 'function') pressable = pressable.parent;
    await act(async () => pressable.props.onPress());

    const accessories = tree.root.findAllByType(InputAccessoryView);
    expect(accessories).toHaveLength(1);
    expect(accessories[0].props.nativeID).toBe(KEYBOARD_DONE_ID);

    const needsDone = inputs().filter(
      i => i.props.keyboardType === 'decimal-pad' || i.props.keyboardType === 'number-pad' || i.props.multiline,
    );
    // used price, new price, estimated value, material %, notes
    expect(needsDone.map(i => i.props.placeholder ?? i.props.accessibilityLabel)).toEqual([
      '$0',
      '$0',
      '$0',
      '%',
      'Add notes about this item...',
    ]);
    for (const input of needsDone) expect(input.props.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
  });

  it('is on the wishlist form too, for its Price and Original price fields', async () => {
    await render({ isWishlist: true });
    expect(tree.root.findAllByType(InputAccessoryView)).toHaveLength(1);
    const numeric = inputs().filter(i => i.props.keyboardType === 'decimal-pad');
    expect(numeric).toHaveLength(2);
    for (const input of numeric) expect(input.props.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
  });
});

describe('Return key on single-line fields', () => {
  it('every Details field ends on Done and Return closes the keyboard', async () => {
    // Moving focus to the next field would put it under the keyboard without scrolling
    // it into view, so each field simply closes the keyboard; tapping the next field
    // scrolls it up.
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    await render();

    for (const placeholder of ['Item Name', 'Brand', 'Retailer/Store', 'Color']) {
      jest.clearAllMocks();
      expect(field(placeholder).props.returnKeyType).toBe('done');
      expect(field(placeholder).props.blurOnSubmit).toBe(true);
      await act(async () => field(placeholder).props.onSubmitEditing());
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(focusCalls()).toEqual([]);
    }
  });

  it('gives Tags and a material name a Done return key as well', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    await render();
    const tags = inputs().find(i => String(i.props.placeholder).startsWith('Tags'))!;
    expect(tags.props.returnKeyType).toBe('done');
    await act(async () => tags.props.onSubmitEditing());
    expect(dismiss).toHaveBeenCalledTimes(1);

    tree.unmount();
    await act(async () => {
      tree = renderer.create(<MaterialsEditor value={[{ name: 'cotton', tier: 'primary' }]} onChange={() => {}} />);
    });
    const name = inputs().find(i => String(i.props.placeholder).startsWith('Material'))!;
    expect(name.props.returnKeyType).toBe('done');
    expect(name.props.blurOnSubmit).toBe(true);
    const pct = inputs().find(i => i.props.placeholder === '%')!;
    expect(pct.props.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
  });
});

describe('Save button', () => {
  it('sits outside the scroll view, so it is on screen however long the form is', async () => {
    await render();
    const scroll = tree.root.findByType(ScrollView);
    expect(textNodes(scroll, 'Save Item')).toHaveLength(0);
    expect(textNodes(tree.root, 'Save Item')).toHaveLength(1);

    // And it still saves when tapped there.
    await act(async () => {
      field('Item Name').props.onChangeText('Linen shirt');
    });
    let pressable: any = textNodes(tree.root, 'Save Item')[0];
    while (pressable && typeof pressable.props.onPress !== 'function') pressable = pressable.parent;
    await act(async () => pressable.props.onPress());
    await flush();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Linen shirt' }));
  });

  it('keeps the same place for Update and for Save to Wishlist', async () => {
    for (const [params, label] of [
      [{ editItem: { id: 'i1', name: 'Coat', category: 'outerwear', color: '', season: [], dateAdded: '', isWishlist: false } }, 'Update Item'],
      [{ isWishlist: true }, 'Save to Wishlist'],
    ] as const) {
      await render(params);
      expect(textNodes(tree.root.findByType(ScrollView), label)).toHaveLength(0);
      expect(textNodes(tree.root, label)).toHaveLength(1);
      act(() => tree.unmount());
    }
  });

  it('uses the shared keyboard-safe scroll view: taps work with the keyboard up and it adjusts for it', async () => {
    await render();
    const scroll = tree.root.findByType(ScrollView);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(scroll.props.keyboardDismissMode).toBe('interactive');
  });
});
