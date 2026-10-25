/**
 * Swap pass B: the shared screens carry the swap pieces (documentation/design/swap.md, 7.7 and Appendix D).
 *
 * Home gets a Swap cell, the item screen the listing card under the quality card, Settings the community
 * switch, a friend's closet a way to their board, and sign-out and account deletion forget the signed photo
 * links. The new screens are routes of the Home stack. The swap service's four reads these screens make are
 * mocked; everything else (the card, the section, the hooks) is the real code.
 */
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: any = {};
// Home keeps only the last focus callback it was given, as its own tests do, to simulate coming back to the tab.
const mockFocus: { current: null | (() => void) } = { current: null };
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useRoute: () => ({ params: mockRouteParams }),
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useFocusEffect: (cb: () => void) => {
      mockFocus.current = cb;
      React.useEffect(cb, [cb]);
    },
  };
});

let mockSession: any = null;
const mockGetSession = jest.fn(async () => ({ data: { session: mockSession }, error: null }));
const mockSignOut = jest.fn(async () => ({ error: null }));
const mockInvoke = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => (mockGetSession as any)(...a),
      signOut: (...a: unknown[]) => (mockSignOut as any)(...a),
    },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

const mockBadge = jest.fn();
const mockSettings = jest.fn();
const mockListMine = jest.fn();
const mockExportSwap = jest.fn();
jest.mock('../../src/services/swapService', () => ({
  ...jest.requireActual('../../src/services/swapService'),
  getSwapBadge: (...a: unknown[]) => mockBadge(...a),
  getSwapSettings: (...a: unknown[]) => mockSettings(...a),
  listMySwapListings: (...a: unknown[]) => mockListMine(...a),
  exportMySwapData: (...a: unknown[]) => mockExportSwap(...a),
}));
const mockClearSwapPhotos = jest.fn();
jest.mock('../../src/services/swapPhotoUrls', () => ({
  signSwapPhotos: jest.fn(async () => new Map()),
  forgetSwapPhoto: jest.fn(),
  clearSwapPhotoCache: (...a: unknown[]) => mockClearSwapPhotos(...a),
}));

const mockExportRatings = jest.fn();
jest.mock('../../src/services/ratingService', () => ({
  ...jest.requireActual('../../src/services/ratingService'),
  exportMyRatings: (...a: unknown[]) => mockExportRatings(...a),
}));

// Pass A's card stands in as a marker, so the order under the value card can be read with ratings off.
jest.mock('../../src/components/ItemQualityCard', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { __esModule: true, default: () => React.createElement(Text, null, 'QUALITY_CARD_STUB') };
});

// The swap card is the real one; this records what the screen hands it.
let mockCardProps: any = null;
jest.mock('../../src/components/SwapListingCard', () => {
  const React = require('react');
  const Real = jest.requireActual('../../src/components/SwapListingCard').default;
  return {
    __esModule: true,
    default: (props: any) => {
      mockCardProps = props;
      return React.createElement(Real, props);
    },
  };
});

const mockItems = jest.fn();
jest.mock('../../src/services/storage', () => ({
  getClothingItems: (...a: unknown[]) => mockItems(...a),
  getClothingItem: jest.fn(async () => null),
  updateClothingItem: jest.fn(async () => undefined),
  deleteClothingItem: jest.fn(async () => undefined),
  saveClothingItem: jest.fn(async () => undefined),
  resetStorage: jest.fn(),
}));
jest.mock('../../src/services/outfitService', () => ({ getSavedOutfits: jest.fn(async () => []) }));
jest.mock('../../src/services/profileService', () => ({ getBodyProfile: jest.fn(async () => null) }));
jest.mock('../../src/services/weatherService', () => ({
  getCurrentLocation: jest.fn(async () => {
    throw new Error('no location');
  }),
  getCurrentWeather: jest.fn(),
}));
jest.mock('../../src/screens/StyleQuizScreen', () => ({ STYLE_PREFS_KEY: '@style_prefs' }));
jest.mock('../../src/services/wearTrackingService', () => ({
  WearTrackingService: { markItemWorn: jest.fn(), undoLastWear: jest.fn() },
}));

// Settings
jest.mock('../../src/config/features', () => ({ PRO_MODES_ENABLED: false }));
jest.mock('../../src/context/AccountModeContext', () => ({
  useAccountMode: () => ({ currentMode: 'user', switchMode: jest.fn() }),
}));
jest.mock('../../src/services/seedDemoData', () => ({ reseedAllDemoData: jest.fn() }));
jest.mock('../../src/services/productContributions', () => ({
  getContributionHistory: jest.fn(async () => []),
  isSharingEnabled: jest.fn(async () => false),
  setSharingEnabled: jest.fn(),
  deleteMySharedContributions: jest.fn(),
}));
jest.mock('../../src/services/aiConsent', () => ({
  getAiConsent: jest.fn(async () => null),
  setAiConsent: jest.fn(async () => undefined),
  ensureAiConsent: jest.fn(async () => false),
}));
// The screens get stand-ins for the three services under test; the tests at the end load the real ones.
jest.mock('../../src/services/authService', () => ({ signOut: jest.fn() }));
jest.mock('../../src/services/accountDeletion', () => ({ deleteAccount: jest.fn() }));
jest.mock('../../src/services/backupService', () => ({
  saveAndShareBackup: jest.fn(),
  clearAllData: jest.fn(),
  getBackupStats: jest.fn(async () => ({ itemsCount: 3, outfitsCount: 1, storageSize: 2048 })),
}));

// What the real authService and accountDeletion reach for.
const mockClearSignedImages = jest.fn(async () => undefined);
jest.mock('../../src/services/imageUrls', () => ({
  ...jest.requireActual('../../src/services/imageUrls'),
  clearSignedImageCache: (...a: unknown[]) => (mockClearSignedImages as any)(...a),
}));
const mockStash = jest.fn(async () => undefined);
const mockClearLocal = jest.fn(async () => undefined);
jest.mock('../../src/services/localData', () => ({
  adoptPersonalLocalData: jest.fn(async () => undefined),
  stashPersonalLocalData: (...a: unknown[]) => (mockStash as any)(...a),
  clearPersonalLocalData: (...a: unknown[]) => (mockClearLocal as any)(...a),
}));
jest.mock('../../src/services/authUser', () => ({ getAuthUserId: jest.fn(async () => 'u1') }));

// A friend's closet
jest.mock('../../src/services/friendService', () => ({
  getFriendCloset: jest.fn(async () => []),
  reportUser: jest.fn(),
  blockUser: jest.fn(),
}));
jest.mock('../../src/components/ClothingCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/UserSafetySheet', () => ({ __esModule: true, default: () => null }));

import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert, Text, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen from '../../src/screens/HomeScreen';
import ItemDetailsScreen from '../../src/screens/ItemDetailsScreen';
import SettingsScreen from '../../src/screens/SettingsScreen';
import FriendClosetScreen from '../../src/screens/FriendClosetScreen';
import { SwapError } from '../../src/services/swapErrors';
import { SWAP_TERMS_VERSION } from '../../src/config/swapRules';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};
const textOf = (tree: renderer.ReactTestRenderer) => flatten(tree.toJSON());
const textsOf = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
const byLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');

const signedIn = () => ({ user: { id: 'u1', email: 'ada@example.com', user_metadata: { name: 'Ada Lovelace' } } });

const swapSettings = (over: object = {}) => ({
  swapsEnabled: true,
  termsAccepted: true,
  termsCurrent: true,
  currentTermsVersion: SWAP_TERMS_VERSION,
  communityAvailable: true,
  communityJoined: false,
  alias: null,
  adultConfirmed: false,
  suspended: false,
  needsYou: 0,
  ...over,
});

const makeItem = (over: Record<string, unknown> = {}) => ({
  id: 'item-1',
  name: 'Linen Shirt',
  category: 'tops',
  color: 'white',
  season: ['summer'],
  dateAdded: '2026-01-01T00:00:00.000Z',
  isWishlist: false,
  ...over,
});

const flush = () =>
  act(async () => {
    await new Promise(resolve => setImmediate(resolve));
  });

const mounted: renderer.ReactTestRenderer[] = [];
const mount = async (element: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element);
  });
  mounted.push(tree);
  await flush();
  return tree;
};

let errorSpy: jest.SpyInstance;

beforeEach(async () => {
  mockSession = signedIn();
  mockRouteParams = {};
  mockCardProps = null;
  mockFocus.current = null;
  [mockNavigate, mockGoBack, mockGetSession, mockSignOut, mockInvoke, mockRpc, mockClearSwapPhotos, mockClearSignedImages, mockStash, mockClearLocal].forEach(m => m.mockClear());
  mockItems.mockReset().mockResolvedValue([]);
  mockBadge.mockReset().mockResolvedValue(0);
  mockSettings.mockReset().mockResolvedValue(swapSettings());
  // A guest cannot list: the real service throws before any call, so the stand-in does the same.
  mockListMine.mockReset().mockImplementation(async () => {
    if (!mockSession) throw new SwapError('not_authenticated');
    return [];
  });
  mockExportSwap.mockReset();
  mockExportRatings.mockReset();
  await AsyncStorage.clear();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  // Nothing may log an error, and every tree is torn down so no effect outlives its test.
  expect(errorSpy).not.toHaveBeenCalled();
  while (mounted.length) {
    const tree = mounted.pop()!;
    act(() => tree.unmount());
  }
  jest.restoreAllMocks();
});

// ─── App.tsx ────────────────────────────────────────────────────────────────

describe('App routes', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../App.tsx'), 'utf8');
  const block = (name: string): string => {
    const start = source.indexOf(`const ${name} = () => {`);
    if (start === -1) throw new Error(`no ${name} in App.tsx`);
    const next = source.indexOf('\nconst ', start + 1);
    return source.slice(start, next === -1 ? undefined : next);
  };
  const SWAP_ROUTES = ['SwapBoard', 'SwapListing', 'MySwaps', 'SwapThread'];

  it('registers the four swap screens in the Home stack, right after FriendCloset and before the professional screens', () => {
    const home = block('HomeStack');
    const at = SWAP_ROUTES.map(r => home.indexOf(`name="${r}"`));
    expect(at.every(i => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(at[0]).toBeGreaterThan(home.indexOf('name="FriendCloset"'));
    expect(at[3]).toBeLessThan(home.indexOf('name="ProHome"'));
    for (const route of SWAP_ROUTES) {
      expect(home).toMatch(new RegExp(`name="${route}" component=\\{${route}Screen\\} options=\\{\\{ headerShown: false \\}\\}`));
    }
  });

  it('puts them nowhere else: the item screen reaches My swaps through Home from every stack', () => {
    for (const stack of ['WardrobeStack', 'WishlistStack']) {
      for (const route of SWAP_ROUTES) expect(block(stack)).not.toContain(`name="${route}"`);
    }
  });

  it('imports each screen from its own file, after the ratings screen', () => {
    const brand = source.indexOf("import BrandReportScreen from './src/screens/BrandReportScreen';");
    expect(brand).toBeGreaterThan(-1);
    let last = brand;
    for (const name of ['SwapBoardScreen', 'SwapListingScreen', 'MySwapsScreen', 'SwapThreadScreen']) {
      const line = `import ${name} from './src/screens/${name}';`;
      const at = source.indexOf(line);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
  });
});

// ─── Home ───────────────────────────────────────────────────────────────────

describe('Home: the Swap cell', () => {
  const cell = (tree: renderer.ReactTestRenderer, sub: string) => byLabel(tree, `Swap, ${sub}`);

  it('is there for a member, with the invitation while nothing needs them, and opens the board', async () => {
    const tree = await mount(<HomeScreen />);
    expect(cell(tree, 'Trade with friends').length).toBeGreaterThan(0);
    await act(async () => cell(tree, 'Trade with friends')[0].props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('SwapBoard');
  });

  it('says how many swaps need the member, in the plural', async () => {
    mockBadge.mockResolvedValue(2);
    const tree = await mount(<HomeScreen />);
    expect(textOf(tree)).toContain('2 need you');
    expect(textOf(tree)).not.toContain('Trade with friends');
  });

  it('says it in the singular for one', async () => {
    mockBadge.mockResolvedValue(1);
    const tree = await mount(<HomeScreen />);
    expect(textOf(tree)).toContain('1 needs you');
  });

  it('stays out of the way of a guest: no cell, and the badge is never asked for', async () => {
    mockSession = null;
    const tree = await mount(<HomeScreen />);
    expect(textOf(tree)).not.toContain('Trade with friends');
    expect(byLabel(tree, 'Swap, Trade with friends')).toHaveLength(0);
    expect(mockBadge).not.toHaveBeenCalled();
  });

  it('shows the invitation when the badge cannot be read, quietly', async () => {
    mockBadge.mockRejectedValue(new Error('offline'));
    const tree = await mount(<HomeScreen />);
    expect(textOf(tree)).toContain('Trade with friends');
    expect(textOf(tree)).not.toMatch(/need/i);
  });

  it('reads the badge again when the tab is focused, and leaves Home\'s own focus callback registered last', async () => {
    const tree = await mount(<HomeScreen />);
    expect(textOf(tree)).toContain('Trade with friends');
    const badgeReads = mockBadge.mock.calls.length;
    expect(badgeReads).toBeGreaterThan(0);

    // The last callback registered is Home's own load: calling it reloads the wardrobe, not the badge.
    const loads = mockItems.mock.calls.length;
    await act(async () => {
      mockFocus.current!();
    });
    await flush();
    expect(mockItems.mock.calls.length).toBeGreaterThan(loads);
    expect(mockBadge.mock.calls.length).toBe(badgeReads);
  });
});

// ─── Item Details ───────────────────────────────────────────────────────────

describe('Item Details: the swap card', () => {
  const render = async (item: any) => {
    mockRouteParams = { item };
    return mount(<ItemDetailsScreen />);
  };

  it('sits under the quality card and above the details of an owned piece', async () => {
    // A guest's line is the card's one text that needs no listing, so the order can be read from it.
    mockSession = null;
    const tree = await render(makeItem());
    const texts = textsOf(tree);
    const value = texts.indexOf('Value');
    const quality = texts.indexOf('QUALITY_CARD_STUB');
    const swap = texts.indexOf('Sign in to swap');
    const details = texts.indexOf('Details');
    expect(value).toBeGreaterThan(-1);
    expect(quality).toBeGreaterThan(value);
    expect(swap).toBeGreaterThan(quality);
    expect(details).toBeGreaterThan(swap);
  });

  it('hands the card the piece and the three ways out of it', async () => {
    const item = makeItem();
    await render(item);
    expect(mockCardProps).not.toBeNull();
    expect(mockCardProps.item).toEqual(expect.objectContaining({ id: 'item-1', name: 'Linen Shirt' }));

    mockCardProps.onEditPiece();
    expect(mockNavigate).toHaveBeenLastCalledWith('AddClothing', { editItem: expect.objectContaining({ id: 'item-1' }) });
    mockCardProps.onOpenSwaps();
    expect(mockNavigate).toHaveBeenLastCalledWith('Home', { screen: 'MySwaps' });
    mockCardProps.onSignIn();
    expect(mockNavigate).toHaveBeenLastCalledWith('Home', { screen: 'SignIn' });
  });

  it('shows a guest the sign-in line, which leads to sign-in through Home, and calls nothing else', async () => {
    mockSession = null;
    const tree = await render(makeItem());
    expect(textsOf(tree)).toContain('Sign in to swap');
    expect(mockListMine).toHaveBeenCalledTimes(1);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();

    const signIn = byLabel(tree, 'Sign in to swap');
    expect(signIn.length).toBeGreaterThan(0);
    await act(async () => signIn[0].props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('Home', { screen: 'SignIn' });
  });

  it('is left off a wishlist piece, which is not the member\'s to swap', async () => {
    const tree = await render(makeItem({ isWishlist: true }));
    expect(mockCardProps).toBeNull();
    expect(mockListMine).not.toHaveBeenCalled();
    expect(textsOf(tree)).not.toContain('Sign in to swap');
  });

  it('adds no text field to the screen', async () => {
    const withCard = await render(makeItem());
    const fields = withCard.root.findAllByType(TextInput).length;
    expect(mockCardProps).not.toBeNull();
    act(() => withCard.unmount());
    mockCardProps = null;
    const without = await render(makeItem({ isWishlist: true }));
    expect(mockCardProps).toBeNull();
    expect(without.root.findAllByType(TextInput).length).toBe(fields);
  });

  it('hides itself, and says nothing, when swaps are off for everyone', async () => {
    mockListMine.mockRejectedValue(new SwapError('swaps_disabled'));
    const tree = await render(makeItem());
    const texts = textsOf(tree);
    expect(texts).not.toContain('Sign in to swap');
    expect(texts).not.toContain('Open to swap');
    expect(texts).not.toContain('Couldn’t load swap status');
    expect(texts).toContain('Details');
  });
});

// ─── Settings ───────────────────────────────────────────────────────────────

describe('Settings: community swaps and the account-deletion words', () => {
  const render = () => mount(<SettingsScreen />);

  it('puts the community switch at the end of the Community section', async () => {
    const texts = textsOf(await render());
    const share = texts.indexOf('Share product details');
    const swap = texts.indexOf('Community swaps');
    const backup = texts.indexOf('Data & Backup');
    expect(share).toBeGreaterThan(-1);
    expect(swap).toBeGreaterThan(share);
    expect(backup).toBeGreaterThan(swap);
    // Nothing of the Community section follows it.
    expect(texts.slice(swap + 1, backup).some(t => /^(Share|Delete all my ratings|Add my ratings)/.test(t))).toBe(false);
  });

  it('shows nothing extra while swaps are paused, the community is closed, or the read fails', async () => {
    for (const next of [
      () => mockSettings.mockResolvedValue(swapSettings({ swapsEnabled: false })),
      () => mockSettings.mockResolvedValue(swapSettings({ communityAvailable: false })),
      () => mockSettings.mockRejectedValue(new SwapError('not_deployed')),
      () => mockSettings.mockRejectedValue(new Error('offline')),
    ]) {
      next();
      const tree = await render();
      expect(textsOf(tree)).not.toContain('Community swaps');
      expect(textsOf(tree)).toContain('Share product details');
    }
  });

  it('shows a guest neither the switch nor a read', async () => {
    mockSession = null;
    const tree = await render();
    expect(textsOf(tree)).not.toContain('Community swaps');
    expect(mockSettings).not.toHaveBeenCalled();
  });

  it('names swap data in the Danger Zone note and in the delete-account alert, with ratings still named', async () => {
    const tree = await render();
    expect(textsOf(tree)).toContain(
      'Permanently deletes your account, wardrobe, ratings, body profile, swap listings and messages, stylist connections, and all uploaded images. Cannot be undone.',
    );
    const alert = Alert.alert as unknown as jest.Mock;
    alert.mockClear();
    const delText = tree.root.findAllByType(Text).find(t => [t.props.children].flat().join('') === 'Delete Account')!;
    let target: renderer.ReactTestInstance | null = delText;
    while (target && typeof target.props.onPress !== 'function') target = target.parent;
    await act(async () => target!.props.onPress());
    const [title, message] = alert.mock.calls[0];
    expect(title).toBe('Delete Account');
    expect(message).toContain(
      'all clothing items, outfits, ratings, body profile, stylist and client data, swap listings, offers and messages, and any uploaded images',
    );
    expect(message).toContain('To confirm, you\'ll be asked to type DELETE.');
  });
});

// ─── A friend's closet ──────────────────────────────────────────────────────

describe('Friend closet: the way to their swap board', () => {
  beforeEach(() => {
    mockRouteParams = { friendId: 'f1', friendName: 'Bea' };
  });

  it('offers "Pieces open to swap" above the closet and opens the board for that friend', async () => {
    const tree = await mount(<FriendClosetScreen />);
    expect(textsOf(tree)).toContain('Pieces open to swap');
    const row = byLabel(tree, 'See items open to swap');
    expect(row.length).toBeGreaterThan(0);
    await act(async () => row[0].props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('SwapBoard', { friendId: 'f1', friendName: 'Bea' });
  });

  it('keeps the rest of the screen: the header, the safety menu and the empty closet', async () => {
    const tree = await mount(<FriendClosetScreen />);
    const texts = textsOf(tree);
    expect(texts).toContain('Bea’s Closet');
    expect(texts).toContain('Nothing shared yet');
    expect(byLabel(tree, 'Go back').length).toBeGreaterThan(0);
    expect(byLabel(tree, 'Report or block Bea').length).toBeGreaterThan(0);
  });
});

// ─── Services ───────────────────────────────────────────────────────────────

describe('Signed photo links are forgotten on sign-out and after account deletion', () => {
  it('signOut clears them, also when the server could not be reached', async () => {
    const { signOut } = jest.requireActual('../../src/services/authService');
    await signOut();
    expect(mockClearSignedImages).toHaveBeenCalledTimes(1);
    expect(mockClearSwapPhotos).toHaveBeenCalledTimes(1);

    // The failure is still reported to the caller, after the links are gone.
    mockClearSwapPhotos.mockClear();
    mockSignOut.mockRejectedValueOnce(new Error('offline'));
    await expect(signOut()).rejects.toThrow('offline');
    expect(mockClearSwapPhotos).toHaveBeenCalledTimes(1);
  });

  it('deleteAccount clears them once the server has deleted the account', async () => {
    const { deleteAccount } = jest.requireActual('../../src/services/accountDeletion');
    mockInvoke.mockResolvedValue({ data: { photosIncomplete: false }, error: null });
    await expect(deleteAccount()).resolves.toEqual({ photosIncomplete: false });
    expect(mockClearSwapPhotos).toHaveBeenCalledTimes(1);
  });

  it('deleteAccount leaves them alone when the server refuses, since nothing local is touched then', async () => {
    const { deleteAccount } = jest.requireActual('../../src/services/accountDeletion');
    mockInvoke.mockResolvedValue({ data: null, error: new Error('server said no') });
    await expect(deleteAccount()).rejects.toThrow('server said no');
    expect(mockClearSwapPhotos).not.toHaveBeenCalled();
    expect(mockClearSignedImages).not.toHaveBeenCalled();
  });
});

describe('Export Data: the ratings and swap sections sit side by side', () => {
  const ratings = { itemRatings: [], brandRatings: [], consents: [] };
  const swap = { settings: null, listings: [{ id: 'l1' }], swaps: [] };
  const { exportData } = jest.requireActual('../../src/services/backupService');

  beforeEach(() => {
    mockItems.mockResolvedValue([makeItem()]);
  });

  it('writes both, ratings first, in a 1.1 file', async () => {
    mockExportRatings.mockResolvedValue(ratings);
    mockExportSwap.mockResolvedValue(swap);
    const backup = await exportData();
    expect(backup.version).toBe('1.1');
    expect(backup.ratings).toEqual(ratings);
    expect(backup.swap).toEqual(swap);
    const keys = Object.keys(backup);
    expect(keys.indexOf('ratings')).toBeGreaterThan(keys.indexOf('outfits'));
    expect(keys.indexOf('swap')).toBeGreaterThan(keys.indexOf('ratings'));
    expect(keys.indexOf('metadata')).toBeGreaterThan(keys.indexOf('swap'));
  });

  it('drops only the section that could not be read', async () => {
    mockExportRatings.mockRejectedValue(new Error('offline'));
    mockExportSwap.mockResolvedValue(swap);
    let backup = await exportData();
    expect('ratings' in backup).toBe(false);
    expect(backup.swap).toEqual(swap);

    mockExportRatings.mockResolvedValue(ratings);
    mockExportSwap.mockRejectedValue(new SwapError('not_authenticated'));
    backup = await exportData();
    expect(backup.ratings).toEqual(ratings);
    expect('swap' in backup).toBe(false);
  });

  it('still exports the closet when neither can be read', async () => {
    mockExportRatings.mockRejectedValue(new Error('offline'));
    mockExportSwap.mockRejectedValue(new Error('offline'));
    const backup = await exportData();
    expect('ratings' in backup).toBe(false);
    expect('swap' in backup).toBe(false);
    expect(backup.items).toHaveLength(1);
  });
});
