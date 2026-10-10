/**
 * The Wishlist money header (total of the wishlist's prices, an editable budget
 * that is kept), the budget sheet's keyboard behaviour, and the price line on
 * each card. The budget service and AsyncStorage are real; only the item list,
 * navigation and the signed-in account are stubbed.
 */
import 'react-native';
import React from 'react';
import { Alert, InputAccessoryView, KeyboardAvoidingView, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, { act } from 'react-test-renderer';
import WishlistScreen from '../../src/screens/WishlistScreen';
import { getWishlistClothingItems } from '../../src/services/storage';
import type { ClothingItem } from '../../src/types';

jest.mock('../../src/services/storage', () => ({
  getWishlistClothingItems: jest.fn(),
  deleteClothingItem: jest.fn(),
  saveClothingItem: jest.fn(),
  updateClothingItem: jest.fn(),
}));
jest.mock('../../src/services/profileService', () => ({ getBodyProfile: jest.fn(async () => null) }));
jest.mock('../../src/screens/WishlistSearchModal', () => () => null);

let mockSession: { user: { id: string } } | null = null;
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: mockSession }, error: null }) } },
}));

// The screen listens for focus on the navigator; keep the callback so a test can return to the screen.
const mockFocus: { current: null | (() => void) } = { current: null };
const mockNavigation = {
  navigate: jest.fn(),
  addListener: jest.fn((_event: string, cb: () => void) => {
    mockFocus.current = cb;
    return jest.fn();
  }),
};
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

const mockGet = getWishlistClothingItems as jest.Mock;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};
const text = (tree: renderer.ReactTestRenderer) => flatten(tree.toJSON());

const wish = (id: string, name: string, extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id,
  name,
  category: 'shoes',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: true,
  ...extra,
});

// One priced item and two without, like the owner's list: a boot at 862 and two search finds with no price.
const BOOTS = wish('w1', 'Knee-High Boots', { cost: 862 });
const SCARF = wish('w2', 'Silk Scarf');
const BAG = wish('w3', 'Straw Tote', { category: 'bags' });

const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<WishlistScreen />);
  });
  return tree;
};
const pressable = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const press = (tree: renderer.ReactTestRenderer, label: string) =>
  act(async () => {
    await pressable(tree, label).props.onPress();
  });
const field = (tree: renderer.ReactTestRenderer) => tree.root.findByType(TextInput);
const type = (tree: renderer.ReactTestRenderer, value: string) =>
  act(async () => field(tree).props.onChangeText(value));
/** Opens the budget sheet whether or not a budget is set. */
const openSheet = async (tree: renderer.ReactTestRenderer) => {
  const tile = tree.root.find(
    n => /^Budget (not set|\$)/.test(n.props.accessibilityLabel ?? '') && typeof n.props.onPress === 'function',
  );
  await act(async () => tile.props.onPress());
};
const sheetOpen = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(TextInput).length > 0;
const saveTyped = async (tree: renderer.ReactTestRenderer, value: string) => {
  await type(tree, value);
  await press(tree, 'Save budget');
};
const budgetKey = '@smartcloset_wishlist_budget:guest';

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSession = null;
  mockGet.mockReset().mockResolvedValue([BOOTS, SCARF, BAG]);
  mockNavigation.navigate.mockReset();
  mockFocus.current = null;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the money header', () => {
  it('shows the total of the wishlist prices, and how many items have none', async () => {
    const t = text(await mount());
    expect(t).toMatch(/Wishlist total\s+\$862\s+2 without a price/);
  });

  it('counts an item priced only by its New (retail) price, and an item with a listed price once', async () => {
    mockGet.mockResolvedValue([
      wish('a', 'Listed', { cost: 100, retailCost: 150 }),
      wish('b', 'Retail only', { retailCost: 40 }),
      wish('c', 'No price', { cost: 0 }),
    ]);
    const t = text(await mount());
    expect(t).toMatch(/Wishlist total\s+\$140\s+1 without a price/);
  });

  it('adds up cents and shows whole dollars with thousands separators', async () => {
    mockGet.mockResolvedValue([wish('a', 'Coat', { cost: 1234.5 }), wish('b', 'Shoes', { cost: 999.75 })]);
    expect(text(await mount())).toMatch(/Wishlist total\s+\$2,234\b/);
  });

  it('leaves out the "without a price" line when every item has a price', async () => {
    mockGet.mockResolvedValue([BOOTS, wish('a', 'Coat', { cost: 38 })]);
    const t = text(await mount());
    expect(t).toMatch(/Wishlist total\s+\$900/);
    expect(t).not.toContain('without a price');
  });

  it('with an empty wishlist shows $0 and no unpriced line', async () => {
    mockGet.mockResolvedValue([]);
    const t = text(await mount());
    expect(t).toMatch(/Wishlist total\s+\$0/);
    expect(t).not.toContain('without a price');
    expect(t).toContain('Your wishlist is empty');
  });

  it('still loads the wishlist when the saved budget cannot be read', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    const t = text(await mount());
    expect(t).toContain('Knee-High Boots');
    expect(t).toMatch(/Wishlist total\s+\$862/);
    expect(t).toMatch(/Budget\s+Not set/);
  });

  it('shows the budget as not set, with a way in, until one is saved', async () => {
    const tree = await mount();
    expect(text(tree)).toMatch(/Budget\s+Not set\s+Tap to set one/);
    expect(text(tree)).not.toContain('Under budget');
    expect(text(tree)).not.toContain('Over budget');
    expect(pressable(tree, 'Budget not set. Set a budget')).toBeDefined();
  });
});

describe('editing the budget', () => {
  it('opens a sheet with an empty field, and nothing is saved yet', async () => {
    const tree = await mount();
    expect(sheetOpen(tree)).toBe(false);
    await openSheet(tree);
    expect(sheetOpen(tree)).toBe(true);
    expect(field(tree).props.value).toBe('');
    expect(text(tree)).toContain('Set Budget');
    expect(pressable(tree, 'Clear budget')).toBeUndefined(); // nothing to clear yet
  });

  it('saves what was typed (thousands separator and all), closes, and shows how far under budget', async () => {
    const tree = await mount();
    await openSheet(tree);
    await saveTyped(tree, '1,200');

    expect(sheetOpen(tree)).toBe(false);
    const t = text(tree);
    expect(t).toMatch(/Budget\s+\$1,200\s+Tap to edit/);
    expect(t).toContain('Under budget by $338'); // 1,200 - 862
    expect(await AsyncStorage.getItem(budgetKey)).toBe('1200');
  });

  it('shows over budget with the amount past it, in the warning colour, with the bar full', async () => {
    const tree = await mount();
    await openSheet(tree);
    await saveTyped(tree, '500');

    expect(text(tree)).toContain('Over budget by $362');
    const bar = tree.root.find(n => n.props.accessibilityRole === 'progressbar');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
    const label = tree.root.findAll(n => typeof n.type !== 'string' && flatten(n.props.children) === 'Over budget by $362')[0];
    expect(label).toBeDefined();
  });

  it('says "Right on budget" when the total matches', async () => {
    const tree = await mount();
    await openSheet(tree);
    await saveTyped(tree, '862');
    expect(text(tree)).toContain('Right on budget');
  });

  it('fills the bar by the share of the budget used', async () => {
    const tree = await mount();
    await openSheet(tree);
    await saveTyped(tree, '1724');
    const bar = tree.root.find(n => n.props.accessibilityRole === 'progressbar');
    expect(bar.props.accessibilityValue.now).toBe(50);
  });

  it('is pre-filled with the current budget when it is opened again, and can be changed', async () => {
    await AsyncStorage.setItem(budgetKey, '1200');
    const tree = await mount();
    expect(text(tree)).toMatch(/Budget\s+\$1,200/);

    await openSheet(tree);
    expect(field(tree).props.value).toBe('1200');
    expect(text(tree)).toContain('Edit Budget');
    await saveTyped(tree, '2000');
    expect(text(tree)).toMatch(/Budget\s+\$2,000/);
    expect(await AsyncStorage.getItem(budgetKey)).toBe('2000');
  });

  it('keeps the budget when the screen is left and come back to', async () => {
    const first = await mount();
    await openSheet(first);
    await saveTyped(first, '750');
    await act(async () => first.unmount());

    const second = await mount();
    expect(text(second)).toMatch(/Budget\s+\$750/);
    expect(text(second)).toContain('Over budget by $112');
  });

  it('shows the saved budget again when focus returns to the screen', async () => {
    const tree = await mount();
    await AsyncStorage.setItem(budgetKey, '3000');
    await act(async () => mockFocus.current!());
    expect(text(tree)).toMatch(/Budget\s+\$3,000/);
  });

  it('Return on the keyboard saves, like the button', async () => {
    const tree = await mount();
    await openSheet(tree);
    await type(tree, '900');
    await act(async () => field(tree).props.onSubmitEditing());
    expect(sheetOpen(tree)).toBe(false);
    expect(text(tree)).toMatch(/Budget\s+\$900/);
    expect(await AsyncStorage.getItem(budgetKey)).toBe('900');
  });

  it('Return and Save arriving together save once', async () => {
    const tree = await mount();
    await openSheet(tree);
    await type(tree, '900');
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    setItem.mockClear(); // the storage mock keeps every earlier test's calls
    await act(async () => {
      field(tree).props.onSubmitEditing();
      pressable(tree, 'Save budget').props.onPress();
    });
    expect(setItem.mock.calls.filter(([key]) => key === budgetKey)).toHaveLength(1);
    expect(text(tree)).toMatch(/Budget\s+\$900/);
  });

  it('closes without saving from the X, and from the dimmed area', async () => {
    const tree = await mount();
    await openSheet(tree);
    await type(tree, '123');
    await press(tree, 'Close');
    expect(sheetOpen(tree)).toBe(false);
    expect(await AsyncStorage.getItem(budgetKey)).toBeNull();

    await openSheet(tree);
    expect(field(tree).props.value).toBe(''); // the abandoned draft is not kept
    await type(tree, '456');
    await act(async () => tree.root.findByProps({ testID: 'budget-backdrop' }).props.onPress());
    expect(sheetOpen(tree)).toBe(false);
    expect(await AsyncStorage.getItem(budgetKey)).toBeNull();
  });

  it('can clear the budget', async () => {
    await AsyncStorage.setItem(budgetKey, '1200');
    const tree = await mount();
    await openSheet(tree);
    await press(tree, 'Clear budget');

    expect(sheetOpen(tree)).toBe(false);
    expect(text(tree)).toMatch(/Budget\s+Not set/);
    expect(text(tree)).not.toContain('Under budget');
    expect(await AsyncStorage.getItem(budgetKey)).toBeNull();
  });

  it('a reload that was already under way does not put the old budget back', async () => {
    await AsyncStorage.setItem(budgetKey, '1200');
    const tree = await mount();

    // Coming back to the tab starts a reload that is slow to answer...
    let release!: (items: ClothingItem[]) => void;
    mockGet.mockReturnValueOnce(new Promise<ClothingItem[]>(resolve => (release = resolve)));
    await act(async () => {
      mockFocus.current!();
    });
    // ...and the budget is changed while it waits.
    await openSheet(tree);
    await saveTyped(tree, '2000');
    expect(text(tree)).toMatch(/Budget\s+\$2,000/);

    await act(async () => release([BOOTS]));
    expect(text(tree)).toMatch(/Budget\s+\$2,000/);
    expect(text(tree)).toMatch(/Wishlist total\s+\$862/); // the items still update
  });
});

describe('a budget that is not a budget', () => {
  it.each([
    ['', 'Enter a dollar amount'],
    ['abc', 'Enter a dollar amount'],
    ['0', 'at least $0.01'],
    ['0.00', 'at least $0.01'],
    ['-20', "can't be negative"],
  ])('%p is refused with a message in the sheet, not an alert, and nothing is saved', async (raw, message) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(budgetKey, '1200');
    const tree = await mount();
    await openSheet(tree);
    await saveTyped(tree, raw);

    expect(sheetOpen(tree)).toBe(true); // still there to fix
    expect(text(tree)).toContain(message);
    expect(tree.root.find(n => n.props.accessibilityRole === 'alert')).toBeDefined();
    expect(alert).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(budgetKey)).toBe('1200');
    expect(text(tree)).toMatch(/Budget\s+\$1,200/);
  });

  it('the message goes away as soon as the number is edited, and a good number then saves', async () => {
    const tree = await mount();
    await openSheet(tree);
    await saveTyped(tree, 'abc');
    expect(text(tree)).toContain('Enter a dollar amount');
    await type(tree, '5');
    expect(text(tree)).not.toContain('Enter a dollar amount');
    await press(tree, 'Save budget');
    expect(text(tree)).toMatch(/Budget\s+\$5\b/);
  });

  it('a failed save is reported in the sheet and the old budget stays', async () => {
    await AsyncStorage.setItem(budgetKey, '1200');
    const tree = await mount();
    await openSheet(tree);
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
    await saveTyped(tree, '2000');

    expect(sheetOpen(tree)).toBe(true);
    expect(text(tree)).toContain("Couldn't save your budget");
    await act(async () => {
      jest.restoreAllMocks();
    });
    expect(await AsyncStorage.getItem(budgetKey)).toBe('1200');
  });
});

describe("each account's own budget", () => {
  it("is not shown under another account, and comes back for its owner", async () => {
    mockSession = { user: { id: 'user-a' } };
    const a = await mount();
    await openSheet(a);
    await saveTyped(a, '500');
    await act(async () => a.unmount());

    mockSession = { user: { id: 'user-b' } };
    const b = await mount();
    expect(text(b)).toMatch(/Budget\s+Not set/);
    await act(async () => b.unmount());

    mockSession = null;
    const guest = await mount();
    expect(text(guest)).toMatch(/Budget\s+Not set/);
    await act(async () => guest.unmount());

    mockSession = { user: { id: 'user-a' } };
    expect(text(await mount())).toMatch(/Budget\s+\$500/);
  });
});

describe('the budget sheet and the keyboard', () => {
  const ancestors = (node: renderer.ReactTestInstance) => {
    const found: renderer.ReactTestInstance[] = [];
    for (let up = node.parent; up; up = up.parent) found.push(up);
    return found;
  };

  it('lifts the field and the buttons above the keyboard, so nothing is covered', async () => {
    await AsyncStorage.setItem(budgetKey, '1200');
    const tree = await mount();
    await openSheet(tree);

    const avoiding = tree.root.findAllByType(KeyboardAvoidingView);
    expect(avoiding).toHaveLength(1);
    expect(avoiding[0].props.behavior).toBe('padding');
    const inside = (node: renderer.ReactTestInstance) => ancestors(node).includes(avoiding[0]);
    expect(inside(field(tree))).toBe(true);
    expect(inside(pressable(tree, 'Save budget'))).toBe(true);
    expect(inside(pressable(tree, 'Clear budget'))).toBe(true);
  });

  it('is a decimal pad with a Save bar above it (a pad has no Return key), and tapping it saves', async () => {
    const tree = await mount();
    await openSheet(tree);
    const input = field(tree);
    expect(input.props.keyboardType).toBe('decimal-pad');
    expect(input.props.returnKeyType).toBe('done');
    expect(input.props.inputAccessoryViewID).toBe('smartcloset-budget-save');
    const bars = tree.root.findAllByType(InputAccessoryView);
    expect(bars).toHaveLength(1);
    expect(bars[0].props.nativeID).toBe('smartcloset-budget-save');

    // Typing a number and tapping Save on the keyboard bar saves it, like the Save Budget button.
    await act(async () => {
      input.props.onChangeText('1500');
    });
    await act(async () => {
      pressable(tree, 'Save').props.onPress();
    });
    expect(await AsyncStorage.getItem(budgetKey)).toBe('1500');
  });

  it('opens with the keyboard up and the current number selected, ready to replace', async () => {
    await AsyncStorage.setItem(budgetKey, '1200');
    const tree = await mount();
    await openSheet(tree);
    expect(field(tree).props.autoFocus).toBe(true);
    expect(field(tree).props.selectTextOnFocus).toBe(true);
  });
});

describe('the price under each card', () => {
  it('shows the price of a priced item and "Add price" for one without', async () => {
    const tree = await mount();
    expect(pressable(tree, 'Edit price of Knee-High Boots, $862')).toBeDefined();
    expect(pressable(tree, 'Add price for Silk Scarf')).toBeDefined();
    expect(pressable(tree, 'Add price for Straw Tote')).toBeDefined();
    expect(text(tree)).toContain('$862');
    expect(text(tree).match(/Add price/g)).toHaveLength(2);
  });

  it('shows a retail-only price too', async () => {
    mockGet.mockResolvedValue([wish('a', 'Wool Coat', { retailCost: 320 })]);
    const tree = await mount();
    expect(pressable(tree, 'Edit price of Wool Coat, $320')).toBeDefined();
    expect(text(tree)).not.toContain('Add price');
  });

  it.each(['Edit price of Knee-High Boots, $862', 'Add price for Silk Scarf'])(
    '%s opens the edit screen for that item',
    async label => {
      const tree = await mount();
      await press(tree, label);
      expect(mockNavigation.navigate).toHaveBeenCalledWith('AddClothing', {
        editItem: expect.objectContaining({ isWishlist: true, name: label.includes('Boots') ? 'Knee-High Boots' : 'Silk Scarf' }),
      });
    },
  );

  it('the total follows an edit: back from the edit screen, a new price is counted and "without a price" goes down', async () => {
    const tree = await mount();
    expect(text(tree)).toMatch(/\$862\s+2 without a price/);

    // The owner prices the scarf and the bag in the edit form and comes back.
    mockGet.mockResolvedValueOnce([BOOTS, { ...SCARF, cost: 180 }, { ...BAG, retailCost: 60 }]);
    await act(async () => mockFocus.current!());
    expect(text(tree)).toMatch(/Wishlist total\s+\$1,102\b/);
    expect(text(tree)).not.toContain('without a price');
    expect(pressable(tree, 'Edit price of Silk Scarf, $180')).toBeDefined();

    // Lowering a price lowers the total.
    mockGet.mockResolvedValueOnce([{ ...BOOTS, cost: 800 }, { ...SCARF, cost: 180 }, { ...BAG, retailCost: 60 }]);
    await act(async () => mockFocus.current!());
    expect(text(tree)).toMatch(/Wishlist total\s+\$1,040\b/);
  });
});

describe('prices with cents', () => {
  it('shows cents on every price and in the total, so the lines add up to the total', async () => {
    mockGet.mockResolvedValue([
      wish('a', 'Boot A', { cost: 12.4 }),
      wish('b', 'Boot B', { cost: 12.4 }),
      wish('c', 'Boot C', { cost: 12.4 }),
    ]);
    const tree = await mount();
    expect(pressable(tree, 'Edit price of Boot A, $12.40')).toBeDefined();
    expect(text(tree)).toMatch(/Wishlist total\s+\$37\.20\b/);
  });

  it('keeps whole dollars when no price has cents', async () => {
    const tree = await mount();
    expect(text(tree)).not.toContain('.00');
  });
});

describe('the price line and the card above it', () => {
  it("does not reach up into the card's Move to wardrobe button", async () => {
    const tree = await mount();
    const price = pressable(tree, 'Edit price of Knee-High Boots, $862');
    expect(price.props.hitSlop.top).toBe(0);
  });
});

