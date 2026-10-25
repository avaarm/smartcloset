/**
 * Home with the professional-accounts build switch on (documentation/design/pro-accounts.md 7.3 and 7.10): the
 * Stylists cell and its badge, the first-run choice handed over from the prompt, the order of Home's focus
 * callbacks, and the wardrobe and wishlist expectations of the other Home suites, which must still hold with the
 * cell present. The last case loads Home again with the switch off and shows none of it. Only the badge read is
 * mocked of the pro code; the cell, the hook and the in-memory choice are the real ones.
 */
import 'react-native';
import React from 'react';
import { Alert, Pressable } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen from '../../src/screens/HomeScreen';
import { getClothingItems } from '../../src/services/storage';
import { getSavedOutfits } from '../../src/services/outfitService';
import { getBodyProfile } from '../../src/services/profileService';
import { resetProEntry, setProEntry, takeProEntry } from '../../src/services/proEntry';
import type { ClothingItem } from '../../src/types';

let mockSession: any = null;
const mockNavigate = jest.fn();
// One object for every render, as React Navigation gives a screen.
const mockNavigation = { navigate: mockNavigate };
const mockProBadge = jest.fn();
const mockSwapBadge = jest.fn();

jest.mock('../../src/config/features', () => ({ PRO_MODES_ENABLED: true }));
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      updateUser: jest.fn(async () => ({ data: {}, error: null })),
    },
  },
}));
jest.mock('../../src/services/proService', () => ({
  ...jest.requireActual('../../src/services/proService'),
  getProBadge: (...a: unknown[]) => mockProBadge(...a),
}));
jest.mock('../../src/services/swapService', () => ({
  ...jest.requireActual('../../src/services/swapService'),
  getSwapBadge: (...a: unknown[]) => mockSwapBadge(...a),
}));
jest.mock('../../src/services/storage', () => ({ getClothingItems: jest.fn() }));
jest.mock('../../src/services/outfitService', () => ({ getSavedOutfits: jest.fn() }));
jest.mock('../../src/services/profileService', () => ({ getBodyProfile: jest.fn() }));
jest.mock('../../src/services/authService', () => ({ signOut: jest.fn() }));
jest.mock('../../src/services/weatherService', () => ({
  getCurrentLocation: jest.fn(async () => {
    throw new Error('no location');
  }),
  getCurrentWeather: jest.fn(),
}));
jest.mock('../../src/screens/StyleQuizScreen', () => ({ STYLE_PREFS_KEY: '@style_prefs' }));

// Home's tests keep only the last focus callback a render registered, to simulate coming back to the tab; the
// others are kept too, in the order they were registered, so the order can be read.
const mockFocus: { current: null | (() => void) } = { current: null };
const mockFocusOrder: Array<() => void> = [];
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => mockNavigation,
    useFocusEffect: (cb: () => void) => {
      mockFocus.current = cb;
      mockFocusOrder.push(cb);
      useEffect(cb, [cb]);
    },
  };
});

const mockItems = getClothingItems as jest.Mock;
const mockOutfits = getSavedOutfits as jest.Mock;

const flatten = (node: any): string => {
  if (!node) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(flatten).join(' ');
  }
  return flatten(node.children);
};
const text = (tree: renderer.ReactTestRenderer) => flatten(tree.toJSON());
const byLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
const flush = () =>
  act(async () => {
    await new Promise(r => setImmediate(r));
  });

const NOW = new Date().toISOString();
const base = (extra: Partial<ClothingItem>): ClothingItem => ({
  id: 'x',
  name: 'x',
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});
// Two owned pieces and a dear, newest wishlist coat, as in the wishlist-separation suite.
const MIXED = [
  base({ id: 'o1', name: 'Owned Blazer', cost: 100, dateAdded: '2026-02-01T00:00:00Z', lastWorn: NOW, wearCount: 3 }),
  base({ id: 'o2', name: 'Owned Jeans', category: 'bottoms', cost: 50, dateAdded: '2026-03-01T00:00:00Z' }),
  base({ id: 'w1', name: 'Wish Coat', category: 'outerwear', cost: 900, retailCost: 1500, isWishlist: true, dateAdded: '2026-09-01T00:00:00Z' }),
];

const signIn = () => {
  mockSession = { user: { id: 'u1', email: 'ada@example.com', user_metadata: { name: 'Ada' } } };
};

const mounted: renderer.ReactTestRenderer[] = [];
const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<HomeScreen />);
  });
  mounted.push(tree);
  await flush();
  return tree;
};

let errorSpy: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  resetProEntry();
  mockSession = null;
  mockFocus.current = null;
  mockFocusOrder.length = 0;
  mockNavigate.mockReset();
  mockProBadge.mockReset().mockResolvedValue(0);
  mockSwapBadge.mockReset().mockResolvedValue(0);
  mockItems.mockReset().mockResolvedValue(MIXED);
  mockOutfits.mockReset().mockResolvedValue([]);
  (getBodyProfile as jest.Mock).mockReset().mockResolvedValue(null);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  // Nothing may log an error, and every tree is torn down so no effect outlives its test.
  expect(errorSpy).not.toHaveBeenCalled();
  while (mounted.length) {
    act(() => mounted.pop()!.unmount());
  }
  resetProEntry();
  jest.restoreAllMocks();
});

describe('Home: the Stylists cell', () => {
  const cell = (tree: renderer.ReactTestRenderer, sub: string) => byLabel(tree, `Stylists, ${sub}`);

  it('is there for a member, with the invitation while nothing needs them, and opens Stylists', async () => {
    signIn();
    const tree = await mount();
    expect(cell(tree, 'Work with a stylist').length).toBeGreaterThan(0);
    expect(tree.root.findAll(n => n.props.name === 'color-wand-outline').length).toBeGreaterThan(0);
    await act(async () => cell(tree, 'Work with a stylist')[0].props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('ProHome');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('comes after the Swap cell, in the signed-in group', async () => {
    signIn();
    const t = text(await mount());
    expect(t.indexOf('Trade with friends')).toBeGreaterThan(-1);
    expect(t.indexOf('Work with a stylist')).toBeGreaterThan(t.indexOf('Trade with friends'));
  });

  it('says how many things need the member, in the plural', async () => {
    signIn();
    mockProBadge.mockResolvedValue(3);
    const tree = await mount();
    expect(cell(tree, '3 need you').length).toBeGreaterThan(0);
    expect(text(tree)).not.toContain('Work with a stylist');
  });

  it('says it in the singular for one', async () => {
    signIn();
    mockProBadge.mockResolvedValue(1);
    const tree = await mount();
    expect(cell(tree, '1 needs you').length).toBeGreaterThan(0);
  });

  it('keeps the Swap count and the Stylists count apart', async () => {
    signIn();
    mockSwapBadge.mockResolvedValue(2);
    mockProBadge.mockResolvedValue(5);
    const tree = await mount();
    expect(byLabel(tree, 'Swap, 2 need you').length).toBeGreaterThan(0);
    expect(cell(tree, '5 need you').length).toBeGreaterThan(0);
  });

  it('stays out of the way of a guest: no cell, and the badge is never asked for', async () => {
    const tree = await mount();
    expect(text(tree)).not.toContain('Work with a stylist');
    expect(text(tree)).not.toContain('Stylists');
    expect(mockProBadge).not.toHaveBeenCalled();
  });

  it('shows the invitation when the badge cannot be read, quietly', async () => {
    signIn();
    mockProBadge.mockRejectedValue(new Error('offline'));
    const tree = await mount();
    expect(cell(tree, 'Work with a stylist').length).toBeGreaterThan(0);
    expect(text(tree)).not.toMatch(/need/i);
  });

  it('reads the badge on focus, and leaves Home\'s own focus callback registered last', async () => {
    signIn();
    const tree = await mount();
    expect(text(tree)).toContain('Work with a stylist');
    const badgeReads = mockProBadge.mock.calls.length;
    expect(badgeReads).toBeGreaterThan(0);

    // The last callback registered is Home's own load: calling it reloads the wardrobe, not the badge.
    const loads = mockItems.mock.calls.length;
    await act(async () => {
      mockFocus.current!();
    });
    await flush();
    expect(mockItems.mock.calls.length).toBeGreaterThan(loads);
    expect(mockProBadge.mock.calls.length).toBe(badgeReads);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('Home: the first-run choice', () => {
  it('opens the stylist setup on Stylists for a person who chose "I\'m a stylist"', async () => {
    signIn();
    setProEntry('stylist');
    await mount();
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('ProHome', { open: 'stylist_setup' });
  });

  it('opens the code sheet for a person who chose "I work with a stylist"', async () => {
    signIn();
    setProEntry('client');
    await mount();
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('ProHome', { open: 'redeem' });
  });

  it('takes the choice once: it is gone after Home read it, and a second Home does not repeat it', async () => {
    signIn();
    setProEntry('client');
    await mount();
    expect(takeProEntry()).toBeNull();
    mockNavigate.mockClear();
    await mount();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('goes nowhere when nothing was chosen', async () => {
    signIn();
    await mount();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('is registered before Home\'s own focus callback, so a refocus reloads the wardrobe and leaves a pending choice alone', async () => {
    signIn();
    await mount();
    // Order of registration within one render: the badges and the hand-off first, the load last.
    expect(mockFocusOrder.length).toBeGreaterThanOrEqual(4);
    expect(mockFocus.current).toBe(mockFocusOrder[mockFocusOrder.length - 1]);

    setProEntry('stylist');
    const loads = mockItems.mock.calls.length;
    await act(async () => {
      mockFocus.current!();
    });
    await flush();
    expect(mockItems.mock.calls.length).toBeGreaterThan(loads);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(takeProEntry()).toBe('stylist');
  });
});

describe('Home with the cell present: the other Home suites\' expectations', () => {
  it('counts owned and wishlist apart, totals only what is owned, and lists only owned items as recently added', async () => {
    signIn();
    const t = text(await mount());
    expect(t).toMatch(/2\s+Items/);
    expect(t).toMatch(/1\s+Wishlist/);
    expect(t).toMatch(/\$\s*150/); // 100 + 50; the 900 coat is not part of WardrobeWorth
    expect(t).toMatch(/Across\s+2\s+item/);
    expect(t).toContain('Owned Jeans');
    expect(t).toContain('Owned Blazer');
    expect(t).not.toContain('Wish Coat');
  });

  it('reads a closet of only wishlist pieces as empty', async () => {
    signIn();
    mockItems.mockResolvedValue([MIXED[2]]);
    const t = text(await mount());
    expect(t).toContain('Your wardrobe is empty');
    expect(t).not.toContain('Wish Coat');
    expect(t).toMatch(/0\s+Items/);
    expect(t).toMatch(/1\s+Wishlist/);
  });

  it('still asks who the wardrobe is for, saves the answer and hides the card', async () => {
    signIn();
    const tree = await mount();
    const TITLE = 'Who is this wardrobe for?';
    expect(text(tree)).toContain(TITLE);
    const group = tree.root.findAll(
      n => n.props.accessibilityRole === 'radiogroup' && n.props.accessibilityLabel === 'This wardrobe is for',
    )[0];
    const women = group.findAllByType(Pressable).find(c => c.props.accessibilityLabel === "Women's")!;
    await act(async () => {
      await women.props.onPress();
    });
    await flush();
    expect(await AsyncStorage.getItem('@smartcloset_wardrobe_for:u:u1')).toBe('women');
    expect(text(tree)).not.toContain(TITLE);
  });

  it('keeps the Stylists cell when a refresh fails, with the earlier numbers on screen', async () => {
    signIn();
    const tree = await mount();
    mockItems.mockRejectedValueOnce(new Error('offline'));
    mockOutfits.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      mockFocus.current!();
    });
    await flush();
    const t = text(tree);
    expect(t).toContain("Couldn't refresh your wardrobe and outfits");
    expect(t).toMatch(/2\s+Items/);
    expect(t).toContain('Work with a stylist');
  });
});

describe('Home with the build switch off', () => {
  afterEach(() => {
    jest.dontMock('../../src/config/features');
  });

  it('shows no Stylists cell, never asks for the badge and leaves a pending choice alone', async () => {
    signIn();
    // A fresh module registry, so React, the renderer and Home all load again under the switch set to false.
    jest.resetModules();
    jest.doMock('../../src/config/features', () => ({ PRO_MODES_ENABLED: false }));
    const OffReact: typeof React = require('react');
    const OffRenderer: typeof renderer = require('react-test-renderer');
    const OffHome: React.ComponentType = require('../../src/screens/HomeScreen').default;
    const offEntry: typeof import('../../src/services/proEntry') = require('../../src/services/proEntry');
    // The mocked neighbours are new mocks too: give them the answers the others have.
    require('../../src/services/storage').getClothingItems.mockResolvedValue(MIXED);
    require('../../src/services/outfitService').getSavedOutfits.mockResolvedValue([]);
    offEntry.setProEntry('stylist');

    let tree!: renderer.ReactTestRenderer;
    await OffRenderer.act(async () => {
      tree = OffRenderer.create(OffReact.createElement(OffHome));
    });
    await OffRenderer.act(async () => {
      await new Promise(r => setImmediate(r));
    });

    const t = flatten(tree.toJSON());
    expect(t).toContain('Trade with friends'); // the signed-in cells are there
    expect(t).not.toContain('Stylists');
    expect(t).not.toContain('Work with a stylist');
    expect(mockProBadge).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(offEntry.takeProEntry()).toBe('stylist');
    OffRenderer.act(() => tree.unmount());
  });
});
