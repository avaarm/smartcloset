import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { ActivityIndicator, FlatList, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockOwned = jest.fn();
jest.mock('../../src/services/storage', () => ({
  getOwnedClothingItems: (...a: any[]) => mockOwned(...a),
}));
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: null } })) }, storage: {} },
}));
// The photo helper is another component's; a marker shows the path it was given.
jest.mock('../../src/components/ProPhoto', () => {
  const R = require('react');
  const ProPhoto = (props: any) => R.createElement('ProPhoto', props);
  return { __esModule: true, default: ProPhoto, ProPhoto };
});

import ProItemPicker from '../../src/components/ProItemPicker';
import { PRO_LIMITS, PRO_PICKER_REMINDER } from '../../src/config/proRules';

type Props = React.ComponentProps<typeof ProItemPicker>;

const piece = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Piece ${id}`,
  category: 'tops',
  color: 'white',
  season: ['summer'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  userImage: `https://example.supabase.co/storage/v1/object/public/wardrobe-images/u1/${id}.jpg`,
  ...over,
});

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const mounted: renderer.ReactTestRenderer[] = [];

const render = async (over: Partial<Props> = {}) => {
  const props: Props = { visible: true, selectedIds: [], onDone: jest.fn(), onClose: jest.fn(), ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProItemPicker {...props} />);
  });
  mounted.push(tree);
  await settle();
  const find = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false });
  const has = (label: string) => find(label).length > 0;
  const press = async (label: string) => {
    const nodes = find(label);
    if (nodes.length !== 1) throw new Error(`Expected one "${label}", found ${nodes.length}`);
    await act(async () => {
      await nodes[0].props.onPress();
    });
    await settle();
  };
  const type = async (text: string) => {
    await act(async () => {
      tree.root.findByType(TextInput).props.onChangeText(text);
    });
  };
  const rerender = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<ProItemPicker {...props} {...next} />);
    });
    await settle();
  };
  return { tree, props, text: () => flatten(tree.toJSON()), has, press, type, rerender };
};

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockOwned.mockReset();
  mockOwned.mockResolvedValue([piece('a'), piece('b'), piece('c')]);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('ProItemPicker: the grid', () => {
  it('reads nothing until it is opened', async () => {
    await render({ visible: false });
    expect(mockOwned).not.toHaveBeenCalled();
  });

  it('shows the person\'s own pieces, with the reminder about photos of people', async () => {
    const { text, has } = await render();
    expect(mockOwned).toHaveBeenCalledTimes(1);
    expect(text()).toContain(PRO_PICKER_REMINDER);
    expect(has('Piece a')).toBe(true);
    expect(has('Piece b')).toBe(true);
    expect(has('Piece c')).toBe(true);
    expect(text()).toContain('Tops');
  });

  it('never lists a wishlist piece, even if one comes back', async () => {
    mockOwned.mockResolvedValue([piece('a'), piece('w', { isWishlist: true })]);
    const { has } = await render();
    expect(has('Piece a')).toBe(true);
    expect(has('Piece w')).toBe(false);
  });

  it('hands each tile the person\'s own photo path and no link', async () => {
    const { tree } = await render();
    const photos = tree.root.findAll(n => (n.type as any) === 'ProPhoto');
    expect(photos.map(p => p.props.ownPath).sort()).toEqual(['u1/a.jpg', 'u1/b.jpg', 'u1/c.jpg']);
    for (const p of photos) {
      expect(p.props.hasPhoto).toBe(true);
      expect(p.props.connectionId).toBeUndefined();
    }
  });

  it('shows a piece with only a retailer picture as having no photo of its own', async () => {
    mockOwned.mockResolvedValue([piece('r', { userImage: undefined, retailerImage: 'https://shop.example/r.jpg' })]);
    const { tree } = await render();
    const photo = tree.root.findAll(n => (n.type as any) === 'ProPhoto')[0];
    expect(photo.props.ownPath).toBeNull();
    expect(photo.props.hasPhoto).toBe(false);
  });

  it('shows a loading mark while the closet is read', async () => {
    const d = deferred<any[]>();
    mockOwned.mockReturnValue(d.promise);
    const { tree } = await render();
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    await act(async () => {
      d.resolve([piece('a')]);
    });
    await settle();
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it('says so when there is nothing to share yet', async () => {
    mockOwned.mockResolvedValue([]);
    const { text, has } = await render();
    expect(text()).toContain('You have no pieces to share yet');
    expect(has('Select all')).toBe(false);
  });

  it('shows a way to try again when the closet cannot be read, and reads again', async () => {
    mockOwned.mockRejectedValueOnce(new Error('offline'));
    const { text, press } = await render();
    expect(text()).toContain("Couldn't load your closet");
    await press('Try again to load your closet');
    expect(mockOwned).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Piece a');
  });

  it('keeps the grid tappable under the keyboard and gives the search box a Return key', async () => {
    const { tree } = await render();
    const grid = tree.root.findByType(FlatList);
    expect(grid.props.keyboardShouldPersistTaps).toBe('handled');
    expect(grid.props.numColumns).toBe(3);
    const input = tree.root.findByType(TextInput);
    expect(input.props.returnKeyType).toBe('search');
    expect(input.props.multiline).toBeFalsy();
  });
});

describe('ProItemPicker: choosing', () => {
  it('starts from the pieces already chosen, in the order they were chosen', async () => {
    const { has, text, press, props } = await render({ selectedIds: ['c', 'a'] });
    expect(has('Piece a, selected')).toBe(true);
    expect(has('Piece c, selected')).toBe(true);
    expect(has('Piece b')).toBe(true);
    expect(text()).toContain('2 pieces selected');
    await press('Piece b');
    await press('Done');
    expect(props.onDone).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it('ticks and unticks a piece and keeps a running count', async () => {
    const { has, text, press } = await render();
    expect(text()).toContain('0 pieces selected');
    await press('Piece a');
    expect(has('Piece a, selected')).toBe(true);
    expect(text()).toContain('1 piece selected');
    await press('Piece a, selected');
    expect(has('Piece a')).toBe(true);
    expect(text()).toContain('0 pieces selected');
  });

  it('applies nothing until Done, and Cancel leaves the caller\'s choice alone', async () => {
    const { press, props } = await render({ selectedIds: ['a'] });
    await press('Piece b');
    await press('Cancel');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onDone).not.toHaveBeenCalled();
  });

  it('starts again from the caller\'s choice each time it is opened', async () => {
    const { press, rerender, has } = await render({ selectedIds: ['a'] });
    await press('Piece b');
    expect(has('Piece b, selected')).toBe(true);
    await rerender({ visible: false });
    await rerender({ visible: true });
    expect(has('Piece b')).toBe(true);
    expect(has('Piece a, selected')).toBe(true);
  });

  it('can finish with nothing chosen', async () => {
    const { press, props } = await render();
    await press('Done');
    expect(props.onDone).toHaveBeenCalledWith([]);
  });

  it('drops a chosen piece that is no longer in the closet', async () => {
    const { press, props, text } = await render({ selectedIds: ['a', 'gone'] });
    expect(text()).toContain('1 piece selected');
    await press('Done');
    expect(props.onDone).toHaveBeenCalledWith(['a']);
  });

  it('selects all, then clears all', async () => {
    const { press, text, has } = await render();
    await press('Select all');
    expect(text()).toContain('3 pieces selected');
    expect(has('Clear all')).toBe(true);
    await press('Clear all');
    expect(text()).toContain('0 pieces selected');
    expect(has('Select all')).toBe(true);
  });

  it('searches by name, and Select all then means the pieces that match', async () => {
    mockOwned.mockResolvedValue([piece('a', { name: 'Blue blazer' }), piece('b', { name: 'Linen shirt' }), piece('c', { name: 'Blue jeans' })]);
    const { type, has, press, props, text } = await render();
    await type('blue');
    expect(has('Blue blazer')).toBe(true);
    expect(has('Blue jeans')).toBe(true);
    expect(has('Linen shirt')).toBe(false);
    await press('Select all');
    expect(text()).toContain('2 pieces selected');
    await press('Clear search');
    expect(has('Linen shirt')).toBe(true);
    await press('Done');
    expect(props.onDone).toHaveBeenCalledWith(['a', 'c']);
  });

  it('says so when no piece matches the search', async () => {
    const { type, text, has } = await render();
    await type('zzz');
    expect(text()).toContain('No pieces match');
    expect(has('Select all')).toBe(true);
  });

  it(`stops at ${PRO_LIMITS.grant_items_max} pieces and says why`, async () => {
    const many = Array.from({ length: PRO_LIMITS.grant_items_max + 2 }, (_, i) => piece(`p${i}`));
    mockOwned.mockResolvedValue(many);
    const { press, text, props } = await render();
    await press('Select all');
    expect(text()).toContain(`${PRO_LIMITS.grant_items_max} pieces selected`);
    expect(text()).toContain(`You can share up to ${PRO_LIMITS.grant_items_max} pieces.`);
    await press('Done');
    const ids = (props.onDone as jest.Mock).mock.calls[0][0] as string[];
    expect(ids).toHaveLength(PRO_LIMITS.grant_items_max);
    expect(new Set(ids).size).toBe(PRO_LIMITS.grant_items_max);
  });

  it('refuses a piece past the limit one at a time too', async () => {
    const many = Array.from({ length: PRO_LIMITS.grant_items_max + 1 }, (_, i) => piece(`p${i}`));
    mockOwned.mockResolvedValue(many);
    const full = many.slice(0, PRO_LIMITS.grant_items_max).map(p => p.id);
    const { press, text, has, type } = await render({ selectedIds: full });
    // The grid draws only the first screenful; search brings the last piece up.
    await type(`p${PRO_LIMITS.grant_items_max}`);
    await press(`Piece p${PRO_LIMITS.grant_items_max}`);
    expect(text()).toContain(`You can share up to ${PRO_LIMITS.grant_items_max} pieces.`);
    expect(has(`Piece p${PRO_LIMITS.grant_items_max}, selected`)).toBe(false);
  });

  it('drops an answer that arrives after the picker was closed', async () => {
    const d = deferred<any[]>();
    mockOwned.mockReturnValue(d.promise);
    const { rerender, text } = await render();
    await rerender({ visible: false });
    await act(async () => {
      d.resolve([piece('late')]);
    });
    await settle();
    expect(text()).not.toContain('Piece late');
  });
});

describe('ProItemPicker source', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProItemPicker.tsx'), 'utf8');

  it('contains no navigation call, no console.error and no storage', () => {
    expect(source).not.toMatch(/\bnavigate\s*\(/);
    expect(source).not.toMatch(/useNavigation/);
    expect(source).not.toMatch(/console\.error/);
    expect(source).not.toMatch(/AsyncStorage/);
  });
});
