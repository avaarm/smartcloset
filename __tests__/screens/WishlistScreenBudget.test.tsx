/**
 * The Wishlist money header (a New total and a Used total, and a budget that is kept
 * and only shown next to them), the budget sheet's keyboard behaviour, and the
 * price line on each card. The budget service and AsyncStorage are real; only the
 * item list, navigation and the signed-in account are stubbed.
 *
 * Every wishlist item can carry two prices: New (retailCost, the full retail price)
 * and Used (cost, the resale price). A wishlist is meant to be bigger than the
 * budget, so nothing here compares the two: there is no bar and no "under / over".
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

// A short list with every state a price can be in: a boot priced both ways, a scarf with only
// a New price, and a bag with no price yet.
//   New total  = 1200 + 180        = 1,380  (the bag has no New price)
//   Used total = 862               =   862  (the scarf and the bag have no Used price)
const BOOTS = wish('w1', 'Knee-High Boots', { cost: 862, retailCost: 1200 });
const SCARF = wish('w2', 'Silk Scarf', { retailCost: 180 });
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
const labelled = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label);
/** Anything that draws a bar or reads like a verdict on the budget. */
const budgetVerdicts = (tree: renderer.ReactTestRenderer) => ({
  words: text(tree).match(/under budget|over budget|on budget|of (?:your|the) budget/gi) ?? [],
  bars: tree.root.findAll(n => n.props.accessibilityRole === 'progressbar' || n.props.accessibilityValue?.now !== undefined),
});
const deferred = () => {
  let resolve!: (items: ClothingItem[]) => void;
  const promise = new Promise<ClothingItem[]>(res => (resolve = res));
  return { promise, resolve };
};

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
  it('shows a New total and a Used total, each with how many items lack that price', async () => {
    const tree = await mount();
    const t = text(tree);
    expect(t).toMatch(/New total\s+\$1,380\s+1 without a new price/);
    expect(t).toMatch(/Used total\s+\$862\s+2 without a used price/);
    expect(t.indexOf('New total')).toBeLessThan(t.indexOf('Used total'));
    expect(labelled(tree, 'New total $1,380, 1 without a new price').length).toBeGreaterThan(0);
    expect(labelled(tree, 'Used total $862, 2 without a used price').length).toBeGreaterThan(0);
  });

  it('is gone: there is no single "Wishlist total" any more', async () => {
    const t = text(await mount());
    expect(t).not.toContain('Wishlist total');
    expect(t).not.toMatch(/without a price\b/);
  });

  it('adds each price to its own total: New is the retail price, Used is the resale price', async () => {
    mockGet.mockResolvedValue([
      wish('a', 'Both', { cost: 100, retailCost: 150 }),
      wish('b', 'New only', { retailCost: 40 }),
      wish('c', 'Used only', { cost: 25 }),
      wish('d', 'Used only too', { cost: 5 }),
      wish('e', 'Zero', { cost: 0, retailCost: 0 }),
    ]);
    const t = text(await mount());
    expect(t).toMatch(/New total\s+\$190\s+3 without a new price/); // 150 + 40; missing: the two used-only and the zero
    expect(t).toMatch(/Used total\s+\$130\s+2 without a used price/); // 100 + 25 + 5; missing: new-only and the zero
  });

  it('never fills one total from the other price', async () => {
    mockGet.mockResolvedValue([wish('a', 'Used only', { cost: 500 })]);
    const t = text(await mount());
    expect(t).toMatch(/New total\s+\$0\s+1 without a new price/);
    expect(t).toMatch(/Used total\s+\$500\b/);

    mockGet.mockResolvedValue([wish('a', 'New only', { retailCost: 500 })]);
    const t2 = text(await mount());
    expect(t2).toMatch(/New total\s+\$500\b/);
    expect(t2).toMatch(/Used total\s+\$0\s+1 without a used price/);
  });

  it('counts an item with neither price in both hints', async () => {
    mockGet.mockResolvedValue([wish('a', 'Bare')]);
    const t = text(await mount());
    expect(t).toMatch(/New total\s+\$0\s+1 without a new price/);
    expect(t).toMatch(/Used total\s+\$0\s+1 without a used price/);
  });

  it('treats a zero, negative or NaN price as no price', async () => {
    mockGet.mockResolvedValue([
      wish('a', 'Free', { cost: 0, retailCost: 0 }),
      wish('b', 'Negative', { cost: -20, retailCost: -30 }),
      wish('c', 'Broken', { cost: NaN, retailCost: NaN }),
      wish('d', 'Real', { cost: 40, retailCost: 60 }),
    ]);
    const t = text(await mount());
    expect(t).toMatch(/New total\s+\$60\s+3 without a new price/);
    expect(t).toMatch(/Used total\s+\$40\s+3 without a used price/);
  });

  it('leaves out both hints when every item has both prices', async () => {
    mockGet.mockResolvedValue([BOOTS, wish('a', 'Coat', { cost: 38, retailCost: 60 })]);
    const t = text(await mount());
    expect(t).toMatch(/New total\s+\$1,260\b/); // 1200 + 60
    expect(t).toMatch(/Used total\s+\$900\b/); // 862 + 38
    expect(t).not.toContain('without a');
  });

  it('shows only the hint for the price that is actually missing', async () => {
    mockGet.mockResolvedValue([wish('a', 'Coat', { cost: 38, retailCost: 60 }), wish('b', 'Hat', { retailCost: 20 })]);
    const t = text(await mount());
    expect(t).toMatch(/Used total\s+\$38\s+1 without a used price/);
    expect(t).not.toContain('without a new price');
  });

  it('with an empty wishlist shows $0 for both and no hints', async () => {
    mockGet.mockResolvedValue([]);
    const tree = await mount();
    const t = text(tree);
    expect(t).toMatch(/New total\s+\$0/);
    expect(t).toMatch(/Used total\s+\$0/);
    expect(t).not.toContain('without a');
    expect(t).toContain('Your wishlist is empty');
    // The spoken label has no "0 without" either.
    expect(labelled(tree, 'New total $0').length).toBeGreaterThan(0);
    expect(labelled(tree, 'Used total $0').length).toBeGreaterThan(0);
  });

  it('still loads the wishlist when the saved budget cannot be read', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    const tree = await mount();
    const t = text(tree);
    expect(t).toContain('Knee-High Boots');
    expect(t).toMatch(/New total\s+\$1,380/);
    expect(t).toMatch(/Used total\s+\$862/);
    expect(t).toMatch(/Budget\s+Not set/);
    expect(pressable(tree, 'Budget not set. Set a budget')).toBeDefined(); // and it can be set again
  });

  it.each(['', 'abc', '-40', '0', 'NaN'])('reads a damaged saved budget (%p) as not set', async raw => {
    await AsyncStorage.setItem(budgetKey, raw);
    const tree = await mount();
    expect(text(tree)).toMatch(/Budget\s+Not set/);
    expect(pressable(tree, 'Budget not set. Set a budget')).toBeDefined();
    expect(text(tree)).toMatch(/New total\s+\$1,380/);
  });
});

describe('the budget row', () => {
  it('shows the budget as not set, with a way in, until one is saved', async () => {
    const tree = await mount();
    expect(text(tree)).toMatch(/Budget\s+Not set/);
    expect(text(tree)).not.toContain('Tap to set one');
    expect(pressable(tree, 'Budget not set. Set a budget').props.accessibilityRole).toBe('button');
    const { words, bars } = budgetVerdicts(tree);
    expect(words).toEqual([]);
    expect(bars).toEqual([]);
  });

  it('sits under the two totals, as a plain row, once a budget is saved', async () => {
    await AsyncStorage.setItem(budgetKey, '3000');
    const tree = await mount();
    const t = text(tree);
    expect(t).toMatch(/Budget\s+\$3,000/);
    expect(t).not.toContain('Tap to edit');
    expect(t.indexOf('Used total')).toBeLessThan(t.indexOf('Budget'));
    expect(pressable(tree, 'Budget $3,000. Edit budget').props.accessibilityRole).toBe('button');
    expect(pressable(tree, 'Budget not set. Set a budget')).toBeUndefined();
  });

  it('shows the cents of a budget that has them, and whole dollars otherwise', async () => {
    await AsyncStorage.setItem(budgetKey, '1200.5');
    const tree = await mount();
    expect(text(tree)).toMatch(/Budget\s+\$1,200\.50/);
    expect(pressable(tree, 'Budget $1,200.50. Edit budget')).toBeDefined();
    expect(text(tree)).not.toContain('$1,200.00');
  });

  // A wishlist is meant to be bigger than the budget. Nothing says whether it is, or by how much.
  it.each([
    ['far below both totals', '100', '$100'],
    ['below the New total but above the Used total', '1000', '$1,000'],
    ['equal to the Used total', '862', '$862'],
    ['equal to the New total', '1380', '$1,380'],
    ['far above both totals', '50000', '$50,000'],
  ])('a budget %s says nothing about the totals: no bar, no under / over / right-on words', async (_label, typed, shown) => {
    const tree = await mount();
    await openSheet(tree);
    await saveTyped(tree, typed);

    expect(text(tree)).toMatch(new RegExp(`Budget\\s+\\${shown}(?!\\d)`));
    const { words, bars } = budgetVerdicts(tree);
    expect(words).toEqual([]);
    expect(bars).toEqual([]);
    // The totals are exactly what they were: the budget does not touch them.
    expect(text(tree)).toMatch(/New total\s+\$1,380\s+1 without a new price/);
    expect(text(tree)).toMatch(/Used total\s+\$862\s+2 without a used price/);
  });

  it('shows no verdict when a saved budget is loaded on opening, over or under', async () => {
    for (const saved of ['500', '1380', '9000']) {
      await AsyncStorage.setItem(budgetKey, saved);
      const tree = await mount();
      const { words, bars } = budgetVerdicts(tree);
      expect(words).toEqual([]);
      expect(bars).toEqual([]);
      await act(async () => tree.unmount());
    }
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

  it('saves what was typed (thousands separator and all), closes, and shows it in the budget row', async () => {
    const tree = await mount();
    await openSheet(tree);
    await saveTyped(tree, '1,200');

    expect(sheetOpen(tree)).toBe(false);
    const t = text(tree);
    expect(t).toMatch(/Budget\s+\$1,200/);
    expect(pressable(tree, 'Budget $1,200. Edit budget')).toBeDefined();
    expect(t).not.toMatch(/under budget|over budget|on budget/i);
    expect(await AsyncStorage.getItem(budgetKey)).toBe('1200');
  });

  it('keeps cents in a saved budget', async () => {
    const tree = await mount();
    await openSheet(tree);
    await saveTyped(tree, '1,200.50');
    expect(text(tree)).toMatch(/Budget\s+\$1,200\.50/);
    expect(await AsyncStorage.getItem(budgetKey)).toBe('1200.5');
  });

  it('saves a budget below both totals without a warning, a coloured message or a bar', async () => {
    const tree = await mount();
    await openSheet(tree);
    await saveTyped(tree, '500');

    expect(text(tree)).toMatch(/Budget\s+\$500/);
    const { words, bars } = budgetVerdicts(tree);
    expect(words).toEqual([]);
    expect(bars).toEqual([]);
    expect(tree.root.findAll(n => n.props.accessibilityRole === 'alert')).toHaveLength(0);
    expect(text(tree)).toMatch(/New total\s+\$1,380/); // the totals did not move
    expect(text(tree)).toMatch(/Used total\s+\$862/);
  });

  it('saves a budget above both totals the same way', async () => {
    const tree = await mount();
    await openSheet(tree);
    await saveTyped(tree, '5000');
    expect(text(tree)).toMatch(/Budget\s+\$5,000/);
    expect(budgetVerdicts(tree).words).toEqual([]);
    expect(budgetVerdicts(tree).bars).toEqual([]);
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
    expect(budgetVerdicts(second).words).toEqual([]);
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
    expect(pressable(tree, 'Budget not set. Set a budget')).toBeDefined();
    expect(budgetVerdicts(tree).words).toEqual([]);
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
    // The items still update: only the boots are left, so both totals are theirs and nothing is missing.
    expect(text(tree)).not.toContain('Silk Scarf');
    expect(text(tree)).toMatch(/New total\s+\$1,200\b/);
    expect(text(tree)).toMatch(/Used total\s+\$862\b/);
    expect(text(tree)).not.toContain('without a');
  });

  it('a reload that was already under way does not bring a cleared budget back', async () => {
    await AsyncStorage.setItem(budgetKey, '1200');
    const tree = await mount();

    // The reload reads the saved 1200 straight away but waits on the slow item list...
    const slow = deferred();
    mockGet.mockReturnValueOnce(slow.promise);
    await act(async () => {
      mockFocus.current!();
    });
    // ...and the budget is cleared while it waits.
    await openSheet(tree);
    await press(tree, 'Clear budget');
    expect(text(tree)).toMatch(/Budget\s+Not set/);

    await act(async () => slow.resolve([BOOTS, SCARF]));
    expect(text(tree)).toMatch(/Budget\s+Not set/);
    expect(text(tree)).not.toContain('Straw Tote'); // the items still update
    expect(await AsyncStorage.getItem(budgetKey)).toBeNull();
  });
});

describe('the totals when reloads overlap', () => {
  it('an older, slower reload that answers last does not put the old totals back', async () => {
    const tree = await mount();
    expect(text(tree)).toMatch(/New total\s+\$1,380/);

    const slow = deferred();
    mockGet.mockReturnValueOnce(slow.promise);
    await act(async () => {
      mockFocus.current!();
    });
    // Meanwhile the bag is priced and a newer reload answers first.
    mockGet.mockResolvedValueOnce([BOOTS, SCARF, { ...BAG, cost: 90, retailCost: 150 }]);
    await act(async () => {
      mockFocus.current!();
    });
    expect(text(tree)).toMatch(/New total\s+\$1,530\b/); // 1200 + 180 + 150
    expect(text(tree)).toMatch(/Used total\s+\$952\b/); // 862 + 90

    // The slow answer still has the bag unpriced: it must not be shown.
    await act(async () => slow.resolve([BOOTS, SCARF, BAG]));
    expect(text(tree)).toMatch(/New total\s+\$1,530\b/);
    expect(text(tree)).toMatch(/Used total\s+\$952\b/);
    expect(text(tree)).not.toContain('1 without a new price');
    expect(pressable(tree, 'Add prices for Straw Tote')).toBeUndefined();
  });

  it('keeps the totals on screen when a reload fails', async () => {
    const tree = await mount();
    mockGet.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      mockFocus.current!();
    });
    expect(text(tree)).toMatch(/New total\s+\$1,380/);
    expect(text(tree)).toMatch(/Used total\s+\$862/);
    expect(text(tree)).toContain('Knee-High Boots');
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
  const BOTH = 'Edit prices of Knee-High Boots: New $1,200  ·  Used $862';

  it('shows New and Used on one line, only the one an item has, and "Add prices" for one with neither', async () => {
    mockGet.mockResolvedValue([BOOTS, SCARF, BAG, wish('w4', 'Thrifted Coat', { cost: 95 })]);
    const tree = await mount();
    expect(pressable(tree, BOTH)).toBeDefined();
    expect(pressable(tree, 'Edit prices of Silk Scarf: New $180')).toBeDefined();
    expect(pressable(tree, 'Edit prices of Thrifted Coat: Used $95')).toBeDefined();
    expect(pressable(tree, 'Add prices for Straw Tote')).toBeDefined();

    const t = text(tree);
    expect(t).toContain('New $1,200  ·  Used $862');
    expect(t).toContain('New $180');
    expect(t).toContain('Used $95');
    expect(t.match(/Add prices/g)).toHaveLength(1);
    // A price an item does not have is not drawn, and no stray separator is left behind.
    expect(t).not.toContain('New $180  ·');
    expect(t).not.toContain('·  Used $95');
  });

  it('the old one-price wording is gone', async () => {
    const tree = await mount();
    expect(pressable(tree, 'Edit price of Knee-High Boots, $862')).toBeUndefined();
    expect(pressable(tree, 'Add price for Straw Tote')).toBeUndefined();
    expect(text(tree)).not.toMatch(/Add price(?!s)/);
  });

  it('puts New before Used, and shows a zero, negative or NaN price as no price at all', async () => {
    mockGet.mockResolvedValue([
      wish('a', 'Free', { cost: 0, retailCost: 0 }),
      wish('b', 'Negative', { cost: -20, retailCost: -30 }),
      wish('c', 'Broken', { cost: NaN }),
      wish('d', 'Half', { cost: 0, retailCost: 75 }),
    ]);
    const tree = await mount();
    for (const name of ['Free', 'Negative', 'Broken']) expect(pressable(tree, `Add prices for ${name}`)).toBeDefined();
    expect(pressable(tree, 'Edit prices of Half: New $75')).toBeDefined();
    expect(text(tree)).not.toMatch(/Used \$0|New \$0|\$-/);
  });

  it.each([
    [BOTH, 'Knee-High Boots'],
    ['Edit prices of Silk Scarf: New $180', 'Silk Scarf'],
    ['Add prices for Straw Tote', 'Straw Tote'],
  ])('%s opens the edit screen for that item', async (label, name) => {
    const tree = await mount();
    await press(tree, label);
    expect(mockNavigation.navigate).toHaveBeenCalledTimes(1);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('AddClothing', {
      editItem: expect.objectContaining({ isWishlist: true, name }),
    });
  });

  it('hands the edit screen the item with both of its prices, so the form can show them', async () => {
    const tree = await mount();
    await press(tree, BOTH);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('AddClothing', {
      editItem: expect.objectContaining({ id: 'w1', cost: 862, retailCost: 1200 }),
    });
  });

  it('the totals follow an edit: back from the edit screen, new prices are counted and the hints go down', async () => {
    const tree = await mount();
    expect(text(tree)).toMatch(/New total\s+\$1,380\s+1 without a new price/);
    expect(text(tree)).toMatch(/Used total\s+\$862\s+2 without a used price/);

    // The owner gives the scarf a used price and the bag both prices in the edit form, and comes back.
    mockGet.mockResolvedValueOnce([BOOTS, { ...SCARF, cost: 120 }, { ...BAG, cost: 60, retailCost: 90 }]);
    await act(async () => mockFocus.current!());
    expect(text(tree)).toMatch(/New total\s+\$1,470\b/); // 1200 + 180 + 90
    expect(text(tree)).toMatch(/Used total\s+\$1,042\b/); // 862 + 120 + 60
    expect(text(tree)).not.toContain('without a');
    expect(pressable(tree, 'Edit prices of Silk Scarf: New $180  ·  Used $120')).toBeDefined();
    expect(pressable(tree, 'Edit prices of Straw Tote: New $90  ·  Used $60')).toBeDefined();

    // Lowering prices lowers the totals.
    mockGet.mockResolvedValueOnce([
      { ...BOOTS, cost: 800, retailCost: 1100 },
      { ...SCARF, cost: 120 },
      { ...BAG, cost: 60, retailCost: 90 },
    ]);
    await act(async () => mockFocus.current!());
    expect(text(tree)).toMatch(/New total\s+\$1,370\b/); // 1100 + 180 + 90
    expect(text(tree)).toMatch(/Used total\s+\$980\b/); // 800 + 120 + 60

    // Clearing a price takes it out of its total only, and the hint comes back.
    mockGet.mockResolvedValueOnce([
      { ...BOOTS, cost: undefined, retailCost: 1100 },
      { ...SCARF, cost: 120 },
      { ...BAG, cost: 60, retailCost: 90 },
    ]);
    await act(async () => mockFocus.current!());
    expect(text(tree)).toMatch(/New total\s+\$1,370\b/);
    expect(text(tree)).toMatch(/Used total\s+\$180\s+1 without a used price/);
    expect(pressable(tree, 'Edit prices of Knee-High Boots: New $1,100')).toBeDefined();
  });
});

describe('prices with cents', () => {
  it('shows cents on every price and in both totals, so the lines add up to the totals', async () => {
    mockGet.mockResolvedValue([
      wish('a', 'Coat', { retailCost: 1234.5, cost: 999.75 }),
      wish('b', 'Shoes', { retailCost: 999.75, cost: 100 }),
    ]);
    const tree = await mount();
    expect(pressable(tree, 'Edit prices of Coat: New $1,234.50  ·  Used $999.75')).toBeDefined();
    expect(pressable(tree, 'Edit prices of Shoes: New $999.75  ·  Used $100.00')).toBeDefined();
    expect(text(tree)).toMatch(/New total\s+\$2,234\.25\b/); // 1234.50 + 999.75
    expect(text(tree)).toMatch(/Used total\s+\$1,099\.75\b/); // 999.75 + 100.00
  });

  it('cents on a Used price alone put cents on the New prices too', async () => {
    mockGet.mockResolvedValue([wish('a', 'Bag', { retailCost: 4000, cost: 3000.5 })]);
    const tree = await mount();
    expect(pressable(tree, 'Edit prices of Bag: New $4,000.00  ·  Used $3,000.50')).toBeDefined();
    expect(text(tree)).toMatch(/New total\s+\$4,000\.00\b/);
    expect(text(tree)).toMatch(/Used total\s+\$3,000\.50\b/);
  });

  it('cents on a New price alone put cents on the Used prices too', async () => {
    mockGet.mockResolvedValue([wish('a', 'Bag', { retailCost: 12.99, cost: 8 })]);
    const tree = await mount();
    expect(pressable(tree, 'Edit prices of Bag: New $12.99  ·  Used $8.00')).toBeDefined();
    expect(text(tree)).toMatch(/Used total\s+\$8\.00\b/);
  });

  it('cents on one item show on a priced item that has none, and on a total that has nothing yet', async () => {
    mockGet.mockResolvedValue([
      wish('a', 'Boot A', { cost: 12.4 }),
      wish('b', 'Boot B', { cost: 12.4 }),
      wish('c', 'Boot C', { cost: 12.4 }),
    ]);
    const tree = await mount();
    expect(pressable(tree, 'Edit prices of Boot A: Used $12.40')).toBeDefined();
    expect(text(tree)).toMatch(/Used total\s+\$37\.20\b/); // not 37.199999...
    expect(text(tree)).toMatch(/New total\s+\$0\.00\s+3 without a new price/);
  });

  it('adds cents exactly in both totals', async () => {
    mockGet.mockResolvedValue([
      wish('a', 'One', { cost: 0.1, retailCost: 0.1 }),
      wish('b', 'Two', { cost: 0.2, retailCost: 0.2 }),
    ]);
    const t = text(await mount());
    expect(t).toMatch(/New total\s+\$0\.30\b/);
    expect(t).toMatch(/Used total\s+\$0\.30\b/);
  });

  it('keeps whole dollars when no price has cents', async () => {
    const tree = await mount();
    expect(text(tree)).not.toContain('.00');
    expect(pressable(tree, 'Edit prices of Knee-High Boots: New $1,200  ·  Used $862')).toBeDefined();
  });

  it('goes back to whole dollars when the price with cents is gone', async () => {
    mockGet.mockResolvedValue([wish('a', 'Bag', { retailCost: 4000, cost: 3000.5 })]);
    const tree = await mount();
    expect(text(tree)).toContain('.50');
    mockGet.mockResolvedValueOnce([wish('a', 'Bag', { retailCost: 4000, cost: 3000 })]);
    await act(async () => mockFocus.current!());
    expect(text(tree)).not.toContain('.50');
    expect(text(tree)).toMatch(/Used total\s+\$3,000(?![.\d])/);
  });
});

describe('the price line and the card above it', () => {
  it.each([
    ['with prices', 'Edit prices of Knee-High Boots: New $1,200  ·  Used $862'],
    ['with none', 'Add prices for Straw Tote'],
  ])("(%s) does not reach up into the card's Move to wardrobe button", async (_state, label) => {
    const tree = await mount();
    const price = pressable(tree, label);
    expect(price.props.hitSlop.top).toBe(0);
    // It is still a comfortable target on the other three sides.
    for (const side of ['bottom', 'left', 'right']) expect(price.props.hitSlop[side]).toBeGreaterThan(0);
    expect(price.props.accessibilityRole).toBe('button');
  });

  it("is a different control from the card's Move button, which keeps its own action", async () => {
    const tree = await mount();
    const move = pressable(tree, 'Move Knee-High Boots to your wardrobe');
    const price = pressable(tree, 'Edit prices of Knee-High Boots: New $1,200  ·  Used $862');
    expect(move).toBeDefined();
    expect(price).not.toBe(move);
    expect(price.props.onPress).not.toBe(move.props.onPress);
    expect(price.props.hitSlop.top).toBe(0);
  });
});
