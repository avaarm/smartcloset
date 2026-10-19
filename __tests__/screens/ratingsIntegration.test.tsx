/**
 * Ratings pass A: the shared screens carry the new pieces (documentation/design/quality-ratings.md, 6.3).
 *
 * With the flags mocked on and the services mocked, the real components sit where the spec puts them on Item
 * Details, Add Item and Settings, and their callbacks reach the right route or write. With every flag off the
 * same screens show none of it and nothing is asked of the network.
 */
jest.mock('react-native/Libraries/Interaction/InteractionManager', () => ({
  runAfterInteractions: (task?: () => void) => {
    task?.();
    return { then: () => undefined, done: () => undefined, cancel: () => undefined };
  },
  createInteractionHandle: () => 1,
  clearInteractionHandle: () => undefined,
}));

let mockFlags = { ratings: true, insights: true, tag: true };
jest.mock('../../src/config/ratingFlags', () => ({
  ...jest.requireActual('../../src/config/ratingFlags'),
  ratingsActive: () => mockFlags.ratings,
  brandInsightsActive: () => mockFlags.ratings && mockFlags.insights,
  tagScanActive: () => mockFlags.tag,
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockItem: any;
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useRoute: () => ({ params: { item: mockItem } }),
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, []),
  };
});

let mockSession: any = null;
const mockGetSession = jest.fn(async () => ({ data: { session: mockSession }, error: null }));
const mockRpc = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...a: unknown[]) => (mockGetSession as any)(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));
jest.mock('../../src/services/authUser', () => ({ getAuthUserId: jest.fn() }));

jest.mock('../../src/services/storage', () => ({
  getClothingItem: jest.fn(async () => mockItem),
  updateClothingItem: jest.fn(async () => undefined),
  deleteClothingItem: jest.fn(async () => undefined),
  saveClothingItem: jest.fn(async () => undefined),
  resetStorage: jest.fn(),
}));
jest.mock('../../src/services/wearTrackingService', () => ({
  WearTrackingService: { markItemWorn: jest.fn(), undoLastWear: jest.fn() },
}));
jest.mock('../../src/services/imageStorage', () => ({
  copyImageToPermanentStorage: jest.fn(async (uri: string) => uri),
}));
jest.mock('../../src/platform/fileSystem', () => ({
  readImageAsBase64: jest.fn(async () => 'base64-photo'),
  discardTempImage: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/productContributions', () => ({
  lookupKnowledgeBase: jest.fn(async () => []),
  recordContribution: jest.fn(async () => undefined),
  getContributionHistory: jest.fn(async () => []),
  isSharingEnabled: jest.fn(async () => false),
  setSharingEnabled: jest.fn(),
  deleteMySharedContributions: jest.fn(),
}));
jest.mock('../../src/services/imageRecognition', () => ({
  ...jest.requireActual('../../src/services/imageRecognition'),
  analyzeClothingImage: jest.fn(),
}));
jest.mock('../../src/services/lensSearchService', () => ({
  ...jest.requireActual('../../src/services/lensSearchService'),
  searchByImage: jest.fn(),
}));

// The rating services: what the real components call.
jest.mock('../../src/services/ratingService', () => ({
  loadMyItemRating: jest.fn(),
  loadMyBrandSummary: jest.fn(),
  loadMyRatingCounts: jest.fn(),
  saveItemRating: jest.fn(),
  deleteItemRating: jest.fn(),
  deleteAllMyRatings: jest.fn(),
  withdrawContributions: jest.fn(),
}));
jest.mock('../../src/services/consentService', () => ({ getConsent: jest.fn(), setConsent: jest.fn() }));
jest.mock('../../src/services/brandInsightService', () => ({ loadBrandInsight: jest.fn() }));

// Settings
jest.mock('../../src/config/features', () => ({ PRO_MODES_ENABLED: false }));
jest.mock('../../src/context/AccountModeContext', () => ({
  useAccountMode: () => ({ currentMode: 'user', switchMode: jest.fn() }),
}));
jest.mock('../../src/services/backupService', () => ({
  saveAndShareBackup: jest.fn(),
  clearAllData: jest.fn(),
  getBackupStats: jest.fn(async () => ({ itemsCount: 3, outfitsCount: 1, storageSize: 2048 })),
}));
jest.mock('../../src/services/seedDemoData', () => ({ reseedAllDemoData: jest.fn() }));
jest.mock('../../src/services/accountDeletion', () => ({ deleteAccount: jest.fn() }));
jest.mock('../../src/services/aiConsent', () => ({
  getAiConsent: jest.fn(async () => null),
  setAiConsent: jest.fn(async () => undefined),
  ensureAiConsent: jest.fn(async () => false),
}));
jest.mock('../../src/services/authService', () => ({ signOut: jest.fn() }));

// The swap card (pass B) reads the member's session to tell a guest from a member. This suite is about
// ratings and asserts that the session is never read with the flags off, so the card is left out here;
// swapIntegration.test.tsx covers it on the same screen.
jest.mock('../../src/components/SwapListingCard', () => ({ __esModule: true, default: () => null }));

// Spies on the props two components are given. The real component still renders.
let mockSectionProps: any = null;
let mockCardProps: any = null;
jest.mock('../../src/components/ScanTagSection', () => {
  const actual = jest.requireActual('../../src/components/ScanTagSection');
  const React = require('react');
  const Real = actual.default;
  const RealCard = actual.ScanTagFormCard;
  return {
    __esModule: true,
    ...actual,
    // autoOpen is held back for the render only, so the test never starts a scan.
    default: (props: any) => {
      mockSectionProps = props;
      return React.createElement(Real, { ...props, autoOpen: false });
    },
    ScanTagFormCard: (props: any) => {
      mockCardProps = props;
      return React.createElement(RealCard, { ...props, autoOpen: false });
    },
  };
});

import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert, Switch, Text, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import ItemDetailsScreen from '../../src/screens/ItemDetailsScreen';
import AddClothingScreen from '../../src/screens/AddClothingScreen';
import SettingsScreen from '../../src/screens/SettingsScreen';
import { BRAND_STRIP_DEBOUNCE_MS } from '../../src/components/BrandInsightStrip';
import { getAuthUserId } from '../../src/services/authUser';
import { deleteClothingItem, saveClothingItem, updateClothingItem } from '../../src/services/storage';
import * as ratingService from '../../src/services/ratingService';
import { getConsent } from '../../src/services/consentService';
import { loadBrandInsight } from '../../src/services/brandInsightService';
import { getAiConsent, setAiConsent } from '../../src/services/aiConsent';
import type { ItemRating } from '../../src/types/rating';

const authUserId = getAuthUserId as jest.Mock;
const loadMyItemRating = ratingService.loadMyItemRating as jest.Mock;
const loadMyBrandSummary = ratingService.loadMyBrandSummary as jest.Mock;
const loadMyRatingCounts = ratingService.loadMyRatingCounts as jest.Mock;
const consentRead = getConsent as jest.Mock;
const brandInsight = loadBrandInsight as jest.Mock;
const updateItem = updateClothingItem as jest.Mock;
const saveItem = saveClothingItem as jest.Mock;

const ID = '5f0e8a52-1b2c-4d3e-8f90-123456789abc';
const ALL_ON = { ratings: true, insights: true, tag: true };
const ALL_OFF = { ratings: false, insights: false, tag: false };

const ok = <T,>(value: T) => ({ state: 'ok' as const, value });

const rating: ItemRating = {
  itemId: ID,
  overall: 4,
  touch: null,
  touchTags: [],
  comfort: null,
  comfortTags: [],
  holdsUp: null,
  holdsUpTags: [],
  fit: null,
  wouldBuyAgain: null,
  note: null,
  contributed: false,
  wearsAtRating: 2,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

const consentRow = (over: Record<string, unknown> = {}) => ({
  purpose: 'share_ratings',
  granted: false,
  policyVersion: null,
  decidedAt: null,
  adultConfirmedAt: null,
  requiresAdult: true,
  currentVersion: '2026-10',
  needsReconsent: false,
  ...over,
});

const makeItem = (over: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'Linen Shirt',
  category: 'tops',
  brand: 'Coach',
  color: 'white',
  season: ['summer'],
  dateAdded: '2026-01-01T00:00:00.000Z',
  isWishlist: false,
  ...over,
});

let errorSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;
const mounted: renderer.ReactTestRenderer[] = [];

beforeEach(() => {
  mockFlags = { ...ALL_ON };
  mockSession = { user: { id: 'u1', email: 'ada@example.com', user_metadata: { name: 'Ada Lovelace' } } };
  mockSectionProps = null;
  mockCardProps = null;
  [mockNavigate, mockGoBack, mockGetSession, mockRpc, updateItem, saveItem, deleteClothingItem as jest.Mock].forEach(m =>
    m.mockClear(),
  );
  authUserId.mockReset().mockResolvedValue('u1');
  loadMyItemRating.mockReset().mockResolvedValue(ok(null));
  loadMyBrandSummary.mockReset().mockResolvedValue(
    ok({ itemsRated: 0, avgOverall: null, brandRating: null, canRateBrand: true }),
  );
  loadMyRatingCounts.mockReset().mockResolvedValue(ok({ items: 0, brands: 0, notContributing: 0 }));
  consentRead.mockReset().mockResolvedValue(ok(consentRow()));
  brandInsight.mockReset().mockResolvedValue({
    state: 'ok',
    value: { status: 'ok', nBucket: '10-24', score: 4.1, asOf: '2026-10-14', item: {}, brand: {}, traits: [], slices: [] },
  });
  (getAiConsent as jest.Mock).mockReset().mockResolvedValue(null);
  (setAiConsent as jest.Mock).mockReset().mockResolvedValue(undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  // Nothing may log an error, and every tree is torn down so no effect outlives its test.
  expect(errorSpy).not.toHaveBeenCalled();
  while (mounted.length) {
    const tree = mounted.pop()!;
    act(() => tree.unmount());
  }
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const flush = () =>
  act(async () => {
    await new Promise(resolve => setImmediate(resolve));
  });

const track = (tree: renderer.ReactTestRenderer) => {
  mounted.push(tree);
  return tree;
};

const textsOf = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

/** Where a text first appears in reading order; fails the test when it is not there. */
const indexOfText = (texts: string[], text: string): number => {
  const at = texts.indexOf(text);
  if (at === -1) {
    throw new Error(`no text "${text}" in: ${texts.join(' | ')}`);
  }
  return at;
};

const pressableAbove = (node: renderer.ReactTestInstance) => {
  let cur: renderer.ReactTestInstance | null = node;
  while (cur && typeof cur.props.onPress !== 'function') {
    cur = cur.parent;
  }
  if (!cur) {
    throw new Error('no pressable ancestor');
  }
  return cur;
};

const byLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');

const hasLabel = (tree: renderer.ReactTestRenderer, label: string) => byLabel(tree, label).length > 0;

const pressLabel = async (tree: renderer.ReactTestRenderer, label: string) => {
  const found = byLabel(tree, label);
  if (found.length === 0) {
    throw new Error(`nothing to press labelled "${label}"`);
  }
  await act(async () => {
    found[0].props.onPress();
  });
};

const pressText = async (tree: renderer.ReactTestRenderer, label: string) => {
  const node = tree.root.findAllByType(Text).find(t => [t.props.children].flat().join('') === label);
  if (!node) {
    throw new Error(`no text "${label}"`);
  }
  await act(async () => {
    pressableAbove(node).props.onPress();
  });
};

// ─── Item Details ───────────────────────────────────────────────────────────

const renderDetails = async (item: any) => {
  mockItem = item;
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ItemDetailsScreen />);
  });
  track(tree);
  await flush();
  return tree;
};

const OWNED = {
  materials: [{ name: 'linen', percentage: 100, tier: 'primary' }],
  tags: ['summer'],
  size: 'M',
  tagText: '100% linen. Machine wash cold.',
};

const deleteAlert = async (tree: renderer.ReactTestRenderer) => {
  alertSpy.mockClear();
  await pressText(tree, 'Delete Item');
  const [title, message, buttons] = alertSpy.mock.calls[0];
  return { title, message, buttons: buttons as any[] };
};

describe('Item Details with the flags on', () => {
  it('puts the quality card after the Value card and before Details', async () => {
    const tree = await renderDetails(makeItem(OWNED));
    const texts = textsOf(tree);
    const value = indexOfText(texts, 'Value');
    const card = indexOfText(texts, 'How is it?');
    const details = indexOfText(texts, 'Details');
    expect(value).toBeLessThan(card);
    expect(card).toBeLessThan(details);
    // The card is given this piece, not another.
    expect(loadMyItemRating).toHaveBeenCalledWith(ID);
    expect(loadMyBrandSummary).toHaveBeenCalledWith('Coach');
  });

  it('shows the card for a wishlist piece too (it handles that case itself), but no scan card or care rows', async () => {
    const tree = await renderDetails(makeItem({ ...OWNED, isWishlist: true }));
    expect(loadMyItemRating).not.toHaveBeenCalled();
    const texts = textsOf(tree);
    expect(texts).not.toContain('How is it?');
    expect(texts).not.toContain('Scan the tag & washing instructions');
    expect(texts).not.toContain('Washing instructions');
    expect(texts).not.toContain('Condition');
    // Size and style are still worth knowing about a piece that is only wished for.
    expect(texts).toContain('About this piece');
    expect(texts).toContain('Size');
    expect(hasLabel(tree, 'Scan the tag & washing instructions')).toBe(false);
  });

  it('opens the brand report from the card and from the brand badge', async () => {
    const tree = await renderDetails(makeItem(OWNED));

    await pressLabel(tree, 'See what members say about Coach');
    expect(mockNavigate).toHaveBeenLastCalledWith('BrandReport', { brand: 'Coach' });

    mockNavigate.mockClear();
    expect(hasLabel(tree, 'Coach brand report')).toBe(true);
    expect(byLabel(tree, 'Coach brand report')[0].props.accessibilityRole).toBe('button');
    await pressLabel(tree, 'Coach brand report');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('BrandReport', { brand: 'Coach' });
  });

  it('has no report to open while brand insights are off: the badge rates the brand instead', async () => {
    mockFlags = { ratings: true, insights: false, tag: true };
    const tree = await renderDetails(makeItem(OWNED));
    expect(hasLabel(tree, 'Coach brand report')).toBe(false);
    expect(hasLabel(tree, 'See what members say about Coach')).toBe(false);
    expect(textsOf(tree)).toContain('Coach');
    // Ratings are on, so the card is.
    expect(textsOf(tree)).toContain('How is it?');
    expect(hasLabel(tree, 'Rate the brand Coach')).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('leaves the brand badge as a plain label with ratings off', async () => {
    mockFlags = { ...ALL_OFF };
    const tree = await renderDetails(makeItem(OWNED));
    expect(textsOf(tree)).toContain('Coach');
    expect(hasLabel(tree, 'Rate the brand Coach')).toBe(false);
    expect(hasLabel(tree, 'Coach brand report')).toBe(false);
  });

  it('adds the rating sentence to the delete confirmation only once the card reports a rating', async () => {
    const plain = await renderDetails(makeItem(OWNED));
    const first = await deleteAlert(plain);
    expect(first.title).toBe('Delete "Linen Shirt"?');
    expect(first.message).toBe('This removes the item from your wardrobe. This action cannot be undone.');

    loadMyItemRating.mockResolvedValue(ok(rating));
    const rated = await renderDetails(makeItem(OWNED));
    expect(textsOf(rated)).toContain('Your rating');
    const second = await deleteAlert(rated);
    expect(second.message).toBe(
      'This removes the item from your wardrobe. Your rating of it will be removed too. This action cannot be undone.',
    );

    // The delete itself is unchanged: Cancel and Delete, and Delete removes the item and goes back.
    expect(second.buttons.map(b => b.text)).toEqual(['Cancel', 'Delete']);
    await act(async () => {
      await second.buttons[1].onPress();
    });
    expect(deleteClothingItem).toHaveBeenCalledWith(ID);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('puts the scan card under the Value card, above Details, and sends the item to the form with the scan switch on', async () => {
    const tree = await renderDetails(makeItem({ ...OWNED, tagText: undefined }));
    const texts = textsOf(tree);
    const scan = indexOfText(texts, 'Scan the tag & washing instructions');
    expect(indexOfText(texts, 'Value')).toBeLessThan(scan);
    expect(scan).toBeLessThan(indexOfText(texts, 'Details'));

    await pressLabel(tree, 'Scan the tag & washing instructions');
    expect(mockNavigate).toHaveBeenCalledWith('AddClothing', {
      editItem: expect.objectContaining({ id: ID, name: 'Linen Shirt' }),
      scanTag: true,
    });
  });

  it('says "Scan the tag again" when the item already has tag text, and shows no card to a guest', async () => {
    const tree = await renderDetails(makeItem(OWNED));
    expect(hasLabel(tree, 'Scan the tag again')).toBe(true);
    expect(hasLabel(tree, 'Scan the tag & washing instructions')).toBe(false);

    authUserId.mockResolvedValue(null);
    const guest = await renderDetails(makeItem(OWNED));
    expect(hasLabel(guest, 'Scan the tag & washing instructions')).toBe(false);
    expect(hasLabel(guest, 'Scan the tag again')).toBe(false);
  });

  it('puts About this piece above Details, and Clear tag text clears the tag text through the store', async () => {
    const tree = await renderDetails(makeItem(OWNED));
    const texts = textsOf(tree);
    const about = indexOfText(texts, 'About this piece');
    expect(indexOfText(texts, 'Value')).toBeLessThan(about);
    expect(about).toBeLessThan(indexOfText(texts, 'Details'));
    expect(texts).toContain('Size');

    await pressLabel(tree, 'Tag text');
    alertSpy.mockClear();
    await pressLabel(tree, 'Clear tag text');
    const [title, , buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Clear the tag text?');
    const confirm = (buttons as any[]).find(b => b.text === 'Clear tag text');
    await act(async () => {
      await confirm.onPress();
    });

    expect(updateItem).toHaveBeenCalledTimes(1);
    expect(updateItem).toHaveBeenCalledWith(expect.objectContaining({ id: ID, tagText: '' }));
    // The tag row is gone; the rest of About this piece stays.
    const after = textsOf(tree);
    expect(after).not.toContain('Tag text');
    expect(after).toContain('About this piece');
    expect(after).toContain('Size');
  });

  it('shows the error line and keeps the tag text when the store refuses to clear it', async () => {
    updateItem.mockRejectedValueOnce(new Error('offline'));
    const tree = await renderDetails(makeItem(OWNED));
    await pressLabel(tree, 'Tag text');
    alertSpy.mockClear();
    await pressLabel(tree, 'Clear tag text');
    const confirm = (alertSpy.mock.calls[0][2] as any[]).find(b => b.text === 'Clear tag text');
    await act(async () => {
      await confirm.onPress();
    });
    expect(textsOf(tree)).toContain('Couldn’t clear that. Please try again.');
    expect(textsOf(tree)).toContain('Tag text');
  });
});

describe('Item Details with every flag off', () => {
  beforeEach(() => {
    mockFlags = { ...ALL_OFF };
  });

  it('shows none of the new pieces and asks nothing of the services', async () => {
    const tree = await renderDetails(makeItem(OWNED));
    const texts = textsOf(tree);
    for (const gone of [
      'How is it?',
      'Your rating',
      'Scan the tag & washing instructions',
      'Scan the tag again',
      'Tag text',
      'Washing instructions',
      'Made in',
    ]) {
      expect(texts).not.toContain(gone);
    }
    // Size, style and condition are facts about the piece, not part of tag scanning or ratings.
    expect(texts).toContain('About this piece');
    expect(texts).toContain('Size');
    expect(texts).toContain('Value');
    expect(texts).toContain('Materials');
    expect(texts).toContain('Tags');
    expect(texts).toContain('Coach');

    expect(hasLabel(tree, 'Coach brand report')).toBe(false);
    for (const spy of [loadMyItemRating, loadMyBrandSummary, loadMyRatingCounts, consentRead, authUserId, mockGetSession, mockRpc]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('keeps today\'s delete confirmation word for word', async () => {
    const tree = await renderDetails(makeItem(OWNED));
    const { title, message, buttons } = await deleteAlert(tree);
    expect(title).toBe('Delete "Linen Shirt"?');
    expect(message).toBe('This removes the item from your wardrobe. This action cannot be undone.');
    expect(buttons.map(b => b.text)).toEqual(['Cancel', 'Delete']);
  });
});

// ─── Add Item ───────────────────────────────────────────────────────────────

const renderAdd = async (params: any = {}) => {
  const navigation = { goBack: jest.fn(), navigate: mockNavigate };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<AddClothingScreen navigation={navigation as any} route={{ params }} />);
  });
  track(tree);
  await flush();
  return { tree, navigation };
};

const field = (tree: renderer.ReactTestRenderer, placeholder: string) =>
  tree.root.findAllByType(TextInput).find(i => i.props.placeholder === placeholder);
const labelled = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === label);

const typeInto = (input: renderer.ReactTestInstance | undefined, value: string) =>
  act(async () => {
    input!.props.onChangeText(value);
  });

const pressSave = async (tree: renderer.ReactTestRenderer, label: string) => {
  await pressText(tree, label);
  await flush();
};

const editItemWithTag = (over: Record<string, unknown> = {}) => ({
  id: 'item-1',
  name: 'Wool coat',
  category: 'outerwear',
  color: 'Grey',
  season: ['fall', 'winter'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  careInstructions: ['Dry clean only'],
  originCountry: 'Italy',
  tagText: '100% wool',
  ...over,
});

describe('Add Item with the flags on', () => {
  it('puts the Label section before the materials editor, after Tags', async () => {
    const { tree } = await renderAdd();
    const texts = textsOf(tree);
    const label = indexOfText(texts, 'Label & washing instructions');
    expect(indexOfText(texts, 'Tags')).toBeLessThan(label);
    expect(label).toBeLessThan(indexOfText(texts, 'Materials'));
    expect(labelled(tree, 'Made in')).toBeTruthy();
  });

  it('puts the scan card right under the photo, before Details', async () => {
    const { tree } = await renderAdd();
    const texts = textsOf(tree);
    const card = indexOfText(texts, 'Scan the tag & washing instructions');
    expect(indexOfText(texts, 'Photo')).toBeLessThan(card);
    expect(card).toBeLessThan(indexOfText(texts, 'Details'));
    expect(texts).toContain('Take a photo of the tag');
  });

  it('hands the card and the section the form\'s own values and callbacks, and opens the scan from the card when asked to', async () => {
    const { tree } = await renderAdd({ editItem: editItemWithTag({ brand: 'Max Mara', size: 'M' }), scanTag: true });
    expect(mockCardProps).toEqual(
      expect.objectContaining({ category: 'outerwear', size: 'M', brand: 'Max Mara', isGuest: false, autoOpen: true }),
    );
    // One scanner: the section below the card has no scan button of its own, so there is one review sheet.
    expect(mockSectionProps).toEqual(
      expect.objectContaining({ category: 'outerwear', size: 'M', brand: 'Max Mara', isGuest: false, showScanButton: false }),
    );
    expect(mockSectionProps.autoOpen).toBeUndefined();
    expect(mockCardProps.tag).toBe(mockSectionProps.tag);
    for (const props of [mockCardProps, mockSectionProps]) {
      expect(typeof props.onMaterialsChange).toBe('function');
      expect(typeof props.onSizeChange).toBe('function');
      expect(typeof props.onBrandChange).toBe('function');
    }
    // The brand and size a scan writes land in the form's own fields.
    await act(async () => mockCardProps.onBrandChange('Totême'));
    await act(async () => mockCardProps.onSizeChange('S'));
    expect(field(tree, 'Brand')!.props.value).toBe('Totême');
    expect(byLabel(tree, 'Letter S')[0].props.accessibilityState.selected).toBe(true);
  });

  it('does not start a scan unless the link on Item Details asked for one, and tells a guest apart', async () => {
    authUserId.mockResolvedValue(null);
    const { tree } = await renderAdd({ editItem: editItemWithTag() });
    expect(mockCardProps.autoOpen).toBe(false);
    expect(mockCardProps.isGuest).toBe(true);
    expect(mockSectionProps.isGuest).toBe(true);
    expect(textsOf(tree)).toContain('Sign in to scan tags.');
  });

  it('sends what the Label section holds with a new item', async () => {
    const { tree } = await renderAdd();
    await typeInto(field(tree, 'Item Name'), 'Silk blouse');
    await typeInto(labelled(tree, 'Made in'), 'Portugal');
    await pressSave(tree, 'Save Item');
    expect(saveItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Silk blouse', originCountry: 'Portugal' }));
  });

  it('keeps an edited item\'s care, country and tag text, and clears the country when it is emptied', async () => {
    const first = await renderAdd({ editItem: editItemWithTag() });
    await pressSave(first.tree, 'Update Item');
    expect(updateItem).toHaveBeenLastCalledWith(
      expect.objectContaining({
        careInstructions: ['Dry clean only'],
        originCountry: 'Italy',
        tagText: '100% wool',
      }),
    );

    const second = await renderAdd({ editItem: editItemWithTag() });
    await typeInto(labelled(second.tree, 'Made in'), '');
    await pressSave(second.tree, 'Update Item');
    expect(updateItem).toHaveBeenLastCalledWith(expect.objectContaining({ originCountry: '' }));
  });

  it('shows the brand score under the Brand field after a pause and opens the report from it', async () => {
    const { tree } = await renderAdd();
    jest.useFakeTimers();
    await typeInto(field(tree, 'Brand'), 'Coach');
    expect(hasLabel(tree, 'Coach brand report')).toBe(false);
    expect(brandInsight).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(BRAND_STRIP_DEBOUNCE_MS);
    });
    expect(brandInsight).toHaveBeenCalledWith('Coach');
    expect(textsOf(tree)).toContain('Members rate Coach 4.1 overall');

    // It sits right under the Brand field, above the Retailer field.
    const all = tree.root.findAll(() => true);
    const brandAt = all.findIndex(n => n.props.placeholder === 'Brand');
    const stripAt = all.findIndex(n => n.props.accessibilityLabel === 'Coach brand report');
    const retailerAt = all.findIndex(n => n.props.placeholder === 'Retailer/Store');
    expect(brandAt).toBeGreaterThan(-1);
    expect(stripAt).toBeGreaterThan(brandAt);
    expect(retailerAt).toBeGreaterThan(stripAt);

    await pressLabel(tree, 'Coach brand report');
    expect(mockNavigate).toHaveBeenCalledWith('BrandReport', { brand: 'Coach' });
  });
});

describe('Add Item with every flag off', () => {
  beforeEach(() => {
    mockFlags = { ...ALL_OFF };
  });

  it('has no Label section and no brand strip, and nothing looked up', async () => {
    const { tree } = await renderAdd({ editItem: editItemWithTag({ brand: 'Coach' }), scanTag: true });
    expect(textsOf(tree)).not.toContain('Label & washing instructions');
    expect(textsOf(tree)).not.toContain('Scan the tag & washing instructions');
    expect(textsOf(tree)).not.toContain('How does it feel?');
    expect(labelled(tree, 'Made in')).toBeUndefined();
    expect(mockSectionProps).toBeNull();
    expect(mockCardProps).toBeNull();
    expect(textsOf(tree)).toContain('Materials');

    jest.useFakeTimers();
    await typeInto(field(tree, 'Brand'), 'Coach Outlet');
    await act(async () => {
      jest.advanceTimersByTime(BRAND_STRIP_DEBOUNCE_MS * 2);
    });
    expect(brandInsight).not.toHaveBeenCalled();
    expect(hasLabel(tree, 'Coach Outlet brand report')).toBe(false);
  });

  it('leaves an edited item\'s care, country and tag text out of the write', async () => {
    const { tree } = await renderAdd({ editItem: editItemWithTag() });
    await pressSave(tree, 'Update Item');
    const written = updateItem.mock.calls[updateItem.mock.calls.length - 1][0];
    expect('careInstructions' in written).toBe(false);
    expect('originCountry' in written).toBe(false);
    expect('tagText' in written).toBe(false);
  });
});

// ─── Settings ───────────────────────────────────────────────────────────────

const renderSettings = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SettingsScreen />);
  });
  track(tree);
  await flush();
  return tree;
};

describe('Settings', () => {
  const shareProductDetails = 'Share product details';

  it('puts the rating rows right after the product-details toggle, before Data & Backup', async () => {
    const tree = await renderSettings();
    const texts = textsOf(tree);
    const share = indexOfText(texts, shareProductDetails);
    const add = indexOfText(texts, 'Add my ratings to brand insights');
    const remove = indexOfText(texts, 'Remove what I’ve added');
    const del = indexOfText(texts, 'Delete all my ratings');
    const backup = indexOfText(texts, 'Data & Backup');
    expect(share).toBeLessThan(add);
    expect(add).toBeLessThan(remove);
    expect(remove).toBeLessThan(del);
    expect(del).toBeLessThan(backup);
    expect(consentRead).toHaveBeenCalledWith('share_ratings');
  });

  it('shows only "Delete all my ratings" while brand insights are off', async () => {
    mockFlags = { ratings: true, insights: false, tag: false };
    const tree = await renderSettings();
    const texts = textsOf(tree);
    expect(texts).toContain('Delete all my ratings');
    expect(texts).not.toContain('Add my ratings to brand insights');
    expect(texts).not.toContain('Remove what I’ve added');
    expect(consentRead).not.toHaveBeenCalled();
  });

  it('shows none of it with every flag off, and asks nothing of the services', async () => {
    mockFlags = { ...ALL_OFF };
    const tree = await renderSettings();
    const texts = textsOf(tree);
    expect(texts).toContain(shareProductDetails);
    for (const gone of ['Delete all my ratings', 'Add my ratings to brand insights', 'Remove what I’ve added']) {
      expect(texts).not.toContain(gone);
    }
    for (const spy of [consentRead, loadMyRatingCounts]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('shows nothing about ratings to a guest, who has no Privacy or sharing rows at all', async () => {
    mockSession = null;
    const tree = await renderSettings();
    const texts = textsOf(tree);
    expect(texts).not.toContain(shareProductDetails);
    expect(texts).not.toContain('Delete all my ratings');
    expect(consentRead).not.toHaveBeenCalled();
  });

  it('names ratings in both places that list what account deletion removes', async () => {
    const tree = await renderSettings();
    // Pass B then added the swap words to both strings (swap.md 7.7); ratings stays named in each.
    expect(textsOf(tree)).toContain(
      'Permanently deletes your account, wardrobe, ratings, body profile, swap listings and messages, and all uploaded images. Cannot be undone.',
    );
    alertSpy.mockClear();
    await pressText(tree, 'Delete Account');
    const [title, message] = alertSpy.mock.calls[0];
    expect(title).toBe('Delete Account');
    expect(message).toContain(
      'all clothing items, outfits, ratings, body profile, stylist data, swap listings, offers and messages, and any uploaded images',
    );
    expect(message).toContain('To confirm, you\'ll be asked to type DELETE.');
  });

  it('tells the person about tag photos in the AI photo analysis text, and stores the plain answer', async () => {
    const tree = await renderSettings();
    const tagSentence = 'Photos of clothing tags and labels are read by Google Cloud Vision to fill in materials, care and country of origin.';
    expect(textsOf(tree).some(t => t.includes(tagSentence))).toBe(true);

    // The first switch on the screen is the AI photo analysis one (Privacy comes before Community).
    const privacySwitch = tree.root.findAllByType(Switch)[0];
    alertSpy.mockClear();
    await act(async () => privacySwitch.props.onValueChange(true));
    const [alertTitle, alertBody, buttons] = alertSpy.mock.calls[0];
    expect(alertTitle).toBe('Use AI to identify your items?');
    expect(alertBody).toContain(tagSentence);

    await act(async () => {
      (buttons as any[]).find(b => b.text === 'Allow').onPress();
    });
    // The build does not send tag text to a model, so the answer carries no tag permission.
    expect(setAiConsent).toHaveBeenCalledWith('granted');
  });
});

// ─── App.tsx ────────────────────────────────────────────────────────────────

describe('App.tsx registers the brand report', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../App.tsx'), 'utf8');
  const stackBody = (name: string): string => {
    const m = source.match(new RegExp(`const ${name} = \\(\\) => \\{([\\s\\S]*?)\\n\\};`));
    if (!m) {
      throw new Error(`no ${name}`);
    }
    return m[1];
  };
  const screens = (name: string) => [...stackBody(name).matchAll(/<Stack\.Screen\s+name="(\w+)"/g)].map(m => m[1]);

  it.each(['WardrobeStack', 'HomeStack', 'WishlistStack'])('%s has BrandReport next to ItemDetails', stack => {
    const names = screens(stack);
    expect(names).toContain('ItemDetails');
    expect(names.filter(n => n === 'BrandReport')).toHaveLength(1);
    expect(names.indexOf('BrandReport')).toBe(names.indexOf('ItemDetails') + 1);
  });

  it('is the only new route: the other stacks are untouched', () => {
    expect(screens('OutfitStack')).not.toContain('BrandReport');
  });

  it('imports the screen after the friend closet import and uses it with no header', () => {
    expect(source).toMatch(
      /import FriendClosetScreen from '\.\/src\/screens\/FriendClosetScreen';\nimport BrandReportScreen from '\.\/src\/screens\/BrandReportScreen';/,
    );
    expect(source.match(/name="BrandReport"\s+component=\{BrandReportScreen\}\s+options=\{\{ headerShown: false \}\}/g)).toHaveLength(3);
  });
});
