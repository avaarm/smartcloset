/**
 * Every screen, sheet and modal with a text field keeps that field (and the
 * buttons under it) above the keyboard, and gives it a way to finish:
 *  - forms scroll with KeyboardSafeScrollView, sheets lift with KeyboardSafeView
 *    or KeyboardLift, lists under a search box take the keyboard list props;
 *  - number pads and multi-line fields point at the Done bar, which the screen
 *    renders once;
 *  - every other field has a Return key.
 */
import 'react-native';
import React from 'react';
import {
  FlatList,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

let mockRouteParams: any = {};
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() }),
    useRoute: () => ({ params: mockRouteParams }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const mockAuth = {
  signInWithGoogle: jest.fn(),
  signInWithApple: jest.fn(),
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  requestPasswordReset: jest.fn(),
  resetPasswordWithCode: jest.fn(),
};
jest.mock('../../src/services/authService', () => ({
  signInWithGoogle: (...a: any[]) => mockAuth.signInWithGoogle(...a),
  signInWithApple: (...a: any[]) => mockAuth.signInWithApple(...a),
  signInWithEmail: (...a: any[]) => mockAuth.signInWithEmail(...a),
  signUpWithEmail: (...a: any[]) => mockAuth.signUpWithEmail(...a),
  requestPasswordReset: (...a: any[]) => mockAuth.requestPasswordReset(...a),
  resetPasswordWithCode: (...a: any[]) => mockAuth.resetPasswordWithCode(...a),
}));

jest.mock('../../src/services/friendService', () => ({
  getFriends: jest.fn(async () => []),
  getPendingRequests: jest.fn(async () => ({ incoming: [], outgoing: [] })),
  getBlockedUsers: jest.fn(async () => []),
  acceptFriendRequest: jest.fn(),
  removeFriendRequest: jest.fn(),
  sendFriendRequest: jest.fn(),
  unblockUser: jest.fn(),
  blockUser: jest.fn(),
  reportUser: jest.fn(),
}));

const closet = [
  { id: 'b1', name: 'Andiamo shopper', category: 'bags', color: 'brown', season: ['fall'], dateAdded: '2026-01-01T00:00:00Z', isWishlist: false },
  { id: 't1', name: 'Linen shirt', category: 'tops', color: 'white', season: ['summer'], dateAdded: '2026-01-01T00:00:00Z', isWishlist: false },
];
jest.mock('../../src/services/storage', () => ({
  getClothingItems: jest.fn(async () => closet),
  getOwnedClothingItems: jest.fn(async () => closet),
  saveClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/outfitService', () => ({ saveOutfit: jest.fn(async () => undefined) }));
jest.mock('../../src/services/wearTrackingService', () => ({
  WearTrackingService: {
    getOutfitHistoryById: jest.fn(async () => []),
    markOutfitWorn: jest.fn(async () => undefined),
  },
}));
jest.mock('../../src/platform/imagePicker', () => ({ pickImageFromLibrary: jest.fn() }));
jest.mock('../../src/services/productUrlService', () => ({ fetchProductMetadata: jest.fn() }));
jest.mock('../../src/services/lensSearchService', () => ({
  ...jest.requireActual('../../src/services/lensSearchService'),
  searchProductsByText: jest.fn(),
  searchByImage: jest.fn(),
}));

// Swap (appended by pass B): a signed-in member who can swap, one accepted swap, one open piece. Plain
// functions rather than jest.fn(), so restoreAllMocks cannot empty them between cases.
jest.mock('../../src/services/swapService', () => {
  const { SWAP_TERMS_VERSION } = require('../../src/config/swapRules');
  const settings = {
    swapsEnabled: true,
    termsAccepted: true,
    termsCurrent: true,
    currentTermsVersion: SWAP_TERMS_VERSION,
    communityAvailable: false,
    communityJoined: false,
    alias: null,
    adultConfirmed: false,
    suspended: false,
    needsYou: 0,
  };
  const piece = (over: object) => ({
    listingId: 'l1',
    side: 'offer',
    mine: true,
    name: 'Blue blazer',
    size: 'M',
    condition: 'good',
    photoPath: 'mine.jpg',
    photoPending: false,
    removalPending: false,
    ...over,
  });
  const swap = {
    id: 's1',
    status: 'accepted',
    closedReason: null,
    role: 'proposer',
    pairKind: 'friends',
    otherLabel: 'Bea',
    createdAt: '2026-10-01T10:00:00Z',
    expiresAt: '2026-10-31T10:00:00Z',
    closedAt: null,
    iDone: false,
    theyDone: false,
    autoCompleted: false,
    items: [piece({}), piece({ listingId: 'l2', side: 'request', mine: false, name: 'Linen shirt', photoPath: 'theirs.jpg' })],
    messages: [],
    actions: { canAccept: false, canDecline: false, canCancel: true, canComplete: true, canMessage: true, messagesLeft: 190 },
  };
  const mine = {
    id: 'm1',
    itemId: 'item-m1',
    audience: 'friends',
    status: 'active',
    name: 'Blue blazer',
    size: 'M',
    condition: 'good',
    photoPath: 'mine.jpg',
    listedAt: '2026-10-01T00:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z',
    openOffers: 0,
    inAcceptedSwap: false,
    stale: false,
  };
  return {
    getSwapSettings: async () => settings,
    getSwap: async () => swap,
    browseSwapListings: async () => ({ items: [], nextCursor: null }),
    listMySwapListings: async () => [mine],
    proposeSwap: async () => 's1',
    publishSwapListing: async () => undefined,
    updateSwapListingNote: async () => undefined,
    acceptSwapTerms: async () => undefined,
    joinSwapCommunity: async () => undefined,
    reportSwapContent: async () => undefined,
    blockSwapMember: async () => undefined,
    respondToSwap: async () => 'accepted',
    cancelSwap: async () => undefined,
    sendSwapMessage: async () => 1,
    completeSwapHandoff: async () => ({ completed: false, receivedItemIds: [], photosPending: 0, removedItemIds: [], removalsPending: 0 }),
  };
});
jest.mock('../../src/services/swapPhotoUrls', () => ({
  signSwapPhotos: async () => new Map(),
  forgetSwapPhoto: () => undefined,
  clearSwapPhotoCache: () => undefined,
}));

// Professional accounts (appended by the cleanup pass): a signed-in adult who holds both roles, with every
// terms version current, one active connection, one sent look and one message. Plain functions, as above.
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
jest.mock('../../src/services/proService', () => {
  const rules = require('../../src/config/proRules');
  const status = {
    proEnabled: true,
    suspended: false,
    adultConfirmed: true,
    stylistRemoved: false,
    versions: {
      stylistTerms: rules.PRO_STYLIST_TERMS_VERSION,
      clientTerms: rules.PRO_CLIENT_TERMS_VERSION,
      shareText: rules.PRO_SHARE_TEXT_VERSION,
    },
    stylist: {
      termsCurrent: true,
      accepting: true,
      approved: true,
      invitesHeld: false,
      activeClients: 1,
      clientLimit: 25,
      liveInvites: 0,
      inviteLimit: 5,
    },
    client: { termsCurrent: true, connections: 1, connectionLimit: 5 },
    badge: 0,
  };
  const connection = {
    id: 'c1',
    myRole: 'client',
    status: 'active',
    endedBy: null,
    startedAt: '2026-10-01T10:00:00Z',
    otherLabel: 'Ann',
    myAlias: 'Bea',
    safetyOnly: false,
    stylist: null,
    closet: { shared: true, itemMode: 'all', itemCount: 8, expiresAt: null, expiresSoon: false, lastViewedAt: null, views30d: 0 },
    counts: { looks: 1, upcoming: 0 },
    actions: {
      canMessage: true,
      canPropose: true,
      canRecommend: true,
      canEnd: true,
      canViewCloset: true,
      canShare: true,
      canStopSharing: true,
      canRename: true,
    },
  };
  const look = {
    id: 'r1',
    connectionId: 'c1',
    status: 'sent',
    title: 'Autumn layers',
    body: 'Try the camel coat over the grey knit.',
    sentAt: '2026-10-20T10:00:00Z',
    items: [{ position: 0, itemId: 'i1', name: 'Camel coat', category: 'outerwear', hasPhoto: false, available: true }],
    feedback: null,
    actions: { canEdit: false, canSend: false, canDelete: false, canGiveFeedback: true, canMarkWorn: true },
  };
  const preview = {
    inviteId: 'inv1',
    alreadyConnected: false,
    clientTermsCurrent: true,
    stylist: { name: 'Ann', headline: 'Wardrobe edits', bio: '', services: [], languages: [], ratesText: '' },
  };
  return {
    getProStatus: async () => status,
    acceptProTerms: async () => undefined,
    getProConnection: async () => connection,
    getProThread: async () => ({
      messages: [{ id: 1, from: 'them', body: 'Hello', at: '2026-10-02T10:00:00Z' }],
      hasMore: false,
      canSend: true,
    }),
    sendProMessage: async () => undefined,
    getProLook: async () => look,
    giveLookFeedback: async () => undefined,
    saveProLook: async () => ({ id: 'r2' }),
    sendProLook: async () => undefined,
    deleteProLook: async () => undefined,
    getClientCloset: async () => ({ items: [], total: 0 }),
    previewProInvite: async () => preview,
    redeemProInvite: async () => ({ connectionId: 'c1', alreadyConnected: false }),
    getMyStylistProfile: async () => null,
    saveStylistProfile: async () => undefined,
    listMyProInvites: async () => [],
    createProInvite: async () => undefined,
    revokeProInvite: async () => undefined,
    reportProContent: async () => undefined,
    blockProMember: async () => undefined,
    proposeProSession: async () => undefined,
    respondProSession: async () => undefined,
    cancelProSession: async () => undefined,
  };
});

import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { KeyboardLift } from '../../src/components/KeyboardLift';
import { REPORT_REASONS } from '../../src/config/communityGuidelines';
import SignInScreen from '../../src/screens/SignInScreen';
import FriendsScreen from '../../src/screens/FriendsScreen';
import WishlistSearchModal from '../../src/screens/WishlistSearchModal';
import MatchPickerSheet from '../../src/screens/MatchPickerSheet';
import CreateOutfitScreen from '../../src/screens/CreateOutfitScreen';
import ManualOutfitBuilderScreen from '../../src/screens/ManualOutfitBuilderScreen';
import OutfitDetailsScreen from '../../src/screens/OutfitDetailsScreen';
import LookbookScreen from '../../src/screens/LookbookScreen';
import UserSafetySheet from '../../src/components/UserSafetySheet';
import RateItemSheet, { RATE_NOTE_ACCESSORY_ID } from '../../src/components/RateItemSheet';
import SwapThreadScreen, { SWAP_MESSAGE_ACCESSORY_ID } from '../../src/screens/SwapThreadScreen';
import SwapBoardScreen from '../../src/screens/SwapBoardScreen';
import SwapOfferSheet from '../../src/components/SwapOfferSheet';
import ListForSwapSheet from '../../src/components/ListForSwapSheet';
import SwapSafetySheet from '../../src/components/SwapSafetySheet';
import SwapJoinCommunitySheet from '../../src/components/SwapJoinCommunitySheet';
import { SWAP_REPORT_REASONS } from '../../src/config/swapRules';
import ProThreadScreen, { PRO_MESSAGE_ACCESSORY_ID } from '../../src/screens/ProThreadScreen';
import ProRecommendationScreen, { PRO_COMMENT_ACCESSORY_ID } from '../../src/screens/ProRecommendationScreen';
import ProLookEditorScreen from '../../src/screens/ProLookEditorScreen';
import ProRedeemSheet from '../../src/components/ProRedeemSheet';
import ProStylistProfileSheet from '../../src/components/ProStylistProfileSheet';
import ProSafetySheet from '../../src/components/ProSafetySheet';
import ProAppointmentSheet from '../../src/components/ProAppointmentSheet';
import ProInvitesSheet from '../../src/components/ProInvitesSheet';
import { PRO_REPORT_REASONS } from '../../src/config/proRules';

type Tree = renderer.ReactTestRenderer;

const RETURN_KEYS = ['done', 'search', 'send', 'next', 'go'];
const NO_RETURN_KEY_TYPES = ['decimal-pad', 'number-pad', 'phone-pad', 'numeric'];

const ancestorsOf = (node: ReactTestInstance) => {
  const out: ReactTestInstance[] = [];
  for (let n = node.parent; n; n = n.parent) out.push(n);
  return out;
};

const inputsOf = (tree: Tree) => tree.root.findAllByType(TextInput);

const placeholderOf = (tree: Tree, placeholder: string) => {
  const found = inputsOf(tree).find(i => i.props.placeholder === placeholder);
  if (!found) throw new Error(`no field with placeholder "${placeholder}"`);
  return found;
};

/** The nearest pressable around the first text equal to `label`. */
const pressText = async (tree: Tree, label: string) => {
  const textNode = tree.root.findAll(
    n => n.children.length === 1 && typeof n.children[0] === 'string' && (n.children[0] as string).trim() === label,
  )[0];
  if (!textNode) throw new Error(`no text "${label}"`);
  let target: ReactTestInstance | null = textNode;
  while (target && typeof target.props.onPress !== 'function') target = target.parent;
  await act(async () => {
    target!.props.onPress();
  });
};

const pressLabel = async (tree: Tree, label: string) => {
  const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  await act(async () => {
    node.props.onPress();
  });
};

const mount = async (element: React.ReactElement): Promise<Tree> => {
  let tree!: Tree;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
};

type Safe = 'scroll' | 'avoiding' | 'lift' | 'below' | 'host';

type Case = {
  name: string;
  element: () => React.ReactElement;
  /** Gets the fields on screen (opens a modal, goes to a form step). */
  open?: (tree: Tree) => Promise<void>;
  /**
   * What keeps the fields above the keyboard: they sit in a keyboard-safe scroll view ('scroll'), a
   * lifted sheet ('avoiding', 'lift'), or above a list that scrolls clear of the keyboard ('below').
   * 'host' = the screen that embeds the component does.
   */
  safe: Safe;
  params?: any;
  /** The accessory id of a sheet that has its own Done bar; the default is the shared one the screen renders. */
  doneId?: string;
};

/** Lets the reads a professional screen makes on opening (access, then the connection, then its data) finish. */
const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {});
  }
};

const outfit = { id: 'o1', name: 'Brunch', items: [], createdAt: '2026-01-01T00:00:00Z' };

const CASES: Case[] = [
  {
    name: 'Sign up form',
    element: () => <SignInScreen onGuestContinue={jest.fn()} />,
    open: tree => pressText(tree, 'Create Account'),
    safe: 'scroll',
  },
  {
    name: 'Sign in form',
    element: () => <SignInScreen onGuestContinue={jest.fn()} />,
    open: tree => pressText(tree, 'Sign in'),
    safe: 'scroll',
  },
  {
    name: 'Reset password, email step',
    element: () => <SignInScreen onGuestContinue={jest.fn()} />,
    open: tree => pressLabel(tree, 'Forgot password'),
    safe: 'scroll',
  },
  {
    name: 'Reset password, code step',
    element: () => <SignInScreen onGuestContinue={jest.fn()} />,
    open: async tree => {
      mockAuth.requestPasswordReset.mockResolvedValue(undefined);
      await pressLabel(tree, 'Forgot password');
      await act(async () => placeholderOf(tree, 'Email address').props.onChangeText('a@b.co'));
      await pressText(tree, 'Send Reset Code');
    },
    safe: 'scroll',
  },
  { name: 'Friends', element: () => <FriendsScreen />, safe: 'scroll' },
  {
    name: 'Add from the web (wishlist search)',
    element: () => <WishlistSearchModal visible onClose={jest.fn()} />,
    safe: 'below',
  },
  {
    name: 'Match picker, text search',
    element: () => (
      <MatchPickerSheet loading={false} kbMatches={[]} lensResults={[]} onPick={jest.fn()} onSkip={jest.fn()} />
    ),
    safe: 'host',
  },
  {
    name: 'Match picker, paste a link',
    element: () => (
      <MatchPickerSheet loading={false} kbMatches={[]} lensResults={[]} onPick={jest.fn()} onSkip={jest.fn()} />
    ),
    open: tree => pressText(tree, 'URL'),
    safe: 'host',
  },
  { name: 'Create outfit', element: () => <CreateOutfitScreen />, safe: 'scroll' },
  {
    name: 'Save outfit sheet',
    element: () => <ManualOutfitBuilderScreen />,
    open: async tree => {
      await pressText(tree, 'Andiamo shopper');
      const check = tree.root
        .findAllByType(TouchableOpacity)
        .find(t => t.findAll(n => (n.type as unknown) === 'Icon' && n.props.name === 'checkmark').length > 0)!;
      await act(async () => check.props.onPress());
    },
    safe: 'avoiding',
  },
  {
    name: 'Mark outfit as worn sheet',
    element: () => <OutfitDetailsScreen />,
    params: { outfit, saved: true },
    open: tree => pressText(tree, 'Mark as Worn Today'),
    safe: 'avoiding',
  },
  {
    name: 'Lookbook look form',
    element: () => <LookbookScreen />,
    open: tree => pressText(tree, '+ Add look'),
    safe: 'scroll',
  },
  {
    name: 'Report details sheet',
    element: () => (
      <UserSafetySheet
        visible
        userId="u1"
        userName="Bob"
        context="friend_request"
        onClose={jest.fn()}
        onBlocked={jest.fn()}
      />
    ),
    open: async tree => {
      await pressLabel(tree, 'Report');
      await pressLabel(tree, REPORT_REASONS[0].label);
    },
    safe: 'lift',
  },
  // Appended by the ratings pass. It has its own Done bar (the item screen already renders the shared one).
  {
    name: 'Rate item sheet',
    element: () => (
      <RateItemSheet
        visible
        item={{ id: 'b1', name: 'Andiamo shopper', brand: 'Coach' }}
        wearCount={0}
        initial={null}
        consentGranted={false}
        onRequestConsent={async () => false}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        onRemoved={jest.fn()}
      />
    ),
    safe: 'avoiding',
    doneId: RATE_NOTE_ACCESSORY_ID,
  },
  // Appended by swap pass B.
  // The composer has an accessory id of its own: the report sheet opened from the same screen renders the shared Done bar.
  {
    name: 'Swap thread composer',
    element: () => <SwapThreadScreen />,
    params: { swapId: 's1' },
    safe: 'avoiding',
    doneId: SWAP_MESSAGE_ACCESSORY_ID,
  },
  {
    name: 'Swap offer sheet',
    element: () => (
      <SwapOfferSheet
        visible
        target={{
          id: 't1',
          ownerLabel: 'Bea',
          ownerKind: 'friend',
          audience: 'friends',
          name: 'Linen shirt',
          category: 'tops',
          size: 'S',
          condition: 'like_new',
          photoPath: 't1.jpg',
          listedAt: '2026-10-01T00:00:00Z',
          mine: false,
        }}
        onClose={jest.fn()}
        onSent={jest.fn()}
        onOpenPieces={jest.fn()}
      />
    ),
    safe: 'lift',
  },
  {
    name: 'Open a piece to swap sheet',
    element: () => (
      <ListForSwapSheet
        visible
        item={{
          id: 'item-1',
          name: 'Linen Shirt',
          category: 'tops',
          color: 'white',
          season: ['summer'],
          dateAdded: '2026-01-01T00:00:00.000Z',
          isWishlist: false,
          brand: 'Everlane',
          size: 'M',
          condition: 'good',
          userImage: 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/u1/1700000000000.jpg',
        }}
        onClose={jest.fn()}
        onEditPiece={jest.fn()}
      />
    ),
    safe: 'lift',
  },
  {
    name: 'Swap report details sheet',
    element: () => (
      <SwapSafetySheet visible refType="listing" refId="l1" label="Bea" onClose={jest.fn()} onBlocked={jest.fn()} />
    ),
    open: async tree => {
      await pressLabel(tree, 'Report');
      await pressLabel(tree, SWAP_REPORT_REASONS[0].label);
    },
    safe: 'lift',
  },
  {
    name: 'Join community swaps sheet',
    element: () => <SwapJoinCommunitySheet visible onJoined={jest.fn()} onClose={jest.fn()} />,
    safe: 'lift',
  },
  { name: 'Swap board search', element: () => <SwapBoardScreen />, safe: 'below' },
  // Appended by the cleanup pass, for the professional accounts (documentation/design/pro-accounts.md 9.3).
  // The thread composer and the look comment field have accessory ids of their own: the report sheet that the
  // same screen opens renders the shared Done bar.
  {
    name: 'Pro thread composer',
    element: () => <ProThreadScreen />,
    params: { connectionId: 'c1' },
    open: settle,
    safe: 'avoiding',
    doneId: PRO_MESSAGE_ACCESSORY_ID,
  },
  {
    name: 'Pro look comment',
    element: () => <ProRecommendationScreen />,
    params: { recId: 'r1', connectionId: 'c1' },
    open: settle,
    safe: 'scroll',
    doneId: PRO_COMMENT_ACCESSORY_ID,
  },
  {
    name: 'Pro look editor',
    element: () => <ProLookEditorScreen />,
    params: { connectionId: 'c1' },
    open: settle,
    safe: 'scroll',
  },
  {
    name: 'Pro connect with a stylist sheet, code step',
    element: () => <ProRedeemSheet visible onClose={jest.fn()} onConnected={jest.fn()} onReport={jest.fn()} />,
    open: settle,
    safe: 'lift',
  },
  {
    name: 'Pro connect with a stylist sheet, name step',
    element: () => <ProRedeemSheet visible onClose={jest.fn()} onConnected={jest.fn()} onReport={jest.fn()} />,
    open: async tree => {
      await settle();
      await act(async () => placeholderOf(tree, 'XXXXX-XXXXX').props.onChangeText('ABCDE-FGHJK'));
      await pressText(tree, 'Continue');
      await settle();
      await pressText(tree, 'Continue');
      await settle();
    },
    safe: 'lift',
  },
  {
    name: 'Pro stylist profile sheet',
    element: () => <ProStylistProfileSheet visible onClose={jest.fn()} onSaved={jest.fn()} />,
    open: settle,
    safe: 'lift',
  },
  {
    name: 'Pro report details sheet',
    element: () => (
      <ProSafetySheet
        visible
        refType="connection"
        refId="c1"
        label="Ann"
        connectionId="c1"
        onClose={jest.fn()}
        onBlocked={jest.fn()}
      />
    ),
    open: async tree => {
      await pressLabel(tree, 'Report');
      await pressLabel(tree, PRO_REPORT_REASONS[0].label);
    },
    safe: 'lift',
  },
  {
    name: 'Pro propose a session sheet',
    element: () => <ProAppointmentSheet visible mode="propose" connectionId="c1" onClose={jest.fn()} onChanged={jest.fn()} />,
    safe: 'lift',
  },
  {
    name: 'Pro invite codes sheet',
    element: () => <ProInvitesSheet visible onClose={jest.fn()} />,
    open: settle,
    safe: 'lift',
  },
];

beforeEach(() => {
  Object.values(mockAuth).forEach(fn => fn.mockReset());
  mockRouteParams = {};
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe.each(CASES)('$name', (testCase: Case) => {
  let tree: Tree;

  beforeEach(async () => {
    mockRouteParams = testCase.params ?? {};
    tree = await mount(testCase.element());
    if (testCase.open) await testCase.open(tree);
  });
  afterEach(() => {
    act(() => tree.unmount());
  });

  it('keeps its fields above the keyboard', () => {
    const inputs = inputsOf(tree);
    expect(inputs.length).toBeGreaterThan(0);

    if (testCase.safe === 'below') {
      const scrollers = [...tree.root.findAllByType(FlatList), ...tree.root.findAllByType(ScrollView)].filter(
        s => !s.props.horizontal,
      );
      expect(
        scrollers.some(
          s =>
            s.props.keyboardShouldPersistTaps === 'handled' &&
            s.props.automaticallyAdjustKeyboardInsets === true &&
            s.props.keyboardDismissMode === 'interactive',
        ),
      ).toBe(true);
      return;
    }
    if (testCase.safe === 'host') return;

    for (const input of inputs) {
      const above = ancestorsOf(input);
      if (testCase.safe === 'scroll') {
        const scroll = above.find(a => a.type === ScrollView);
        expect(scroll?.props.automaticallyAdjustKeyboardInsets).toBe(true);
        expect(scroll?.props.keyboardShouldPersistTaps).toBe('handled');
      } else if (testCase.safe === 'avoiding') {
        const lifter = above.find(a => a.type === KeyboardAvoidingView);
        expect(lifter?.props.behavior).toBe('padding');
        // A sheet's own scroll view must not also add keyboard insets: the sheet is already lifted.
        const scroll = above.find(a => a.type === ScrollView);
        if (scroll) {
          expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
          expect(scroll.props.automaticallyAdjustKeyboardInsets).toBeFalsy();
        }
      } else {
        expect(above.some(a => a.type === KeyboardLift)).toBe(true);
      }
    }
  });

  it('gives number pads and multi-line fields the Done bar, and the rest a Return key', () => {
    const inputs = inputsOf(tree);
    for (const input of inputs) {
      const { keyboardType, multiline, returnKeyType, blurOnSubmit, inputAccessoryViewID } = input.props;
      if (multiline || NO_RETURN_KEY_TYPES.includes(keyboardType)) {
        expect(inputAccessoryViewID).toBe(testCase.doneId ?? KEYBOARD_DONE_ID);
      } else {
        expect(RETURN_KEYS).toContain(returnKeyType);
        // Return either moves on to the next field or closes the keyboard.
        expect(returnKeyType === 'next' || blurOnSubmit !== false).toBe(true);
      }
    }

    // The bar is rendered once; a form may show it before the step that needs it.
    const bars = tree.root.findAllByType(InputAccessoryView);
    expect(bars.length).toBeLessThanOrEqual(1);
    const doneId = testCase.doneId ?? KEYBOARD_DONE_ID;
    if (inputs.some(i => i.props.inputAccessoryViewID === doneId)) {
      expect(bars).toHaveLength(1);
      expect(bars[0].props.nativeID).toBe(doneId);
    }
  });
});

describe('Return keys do something', () => {
  beforeEach(() => {
    mockRouteParams = {};
  });

  it('the outfit name field closes the keyboard', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const tree = await mount(<CreateOutfitScreen />);
    await act(async () => placeholderOf(tree, 'e.g., Summer Brunch, Office Look').props.onSubmitEditing());
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('sign up moves name -> email -> password, then creates the account', async () => {
    mockAuth.signUpWithEmail.mockResolvedValue({ session: null });
    const tree = await mount(<SignInScreen onGuestContinue={jest.fn()} />);
    await pressText(tree, 'Create Account');
    const focus = (require('react-native').TextInput as any).prototype.focus as jest.Mock;
    focus.mockClear();

    const name = placeholderOf(tree, 'Full name');
    const email = placeholderOf(tree, 'Email address');
    const password = placeholderOf(tree, 'Password');
    expect(name.props.returnKeyType).toBe('next');
    expect(email.props.returnKeyType).toBe('next');
    expect(password.props.returnKeyType).toBe('done');

    await act(async () => name.props.onSubmitEditing());
    expect(focus.mock.instances[0]).toBe(email.instance);
    await act(async () => email.props.onSubmitEditing());
    expect(focus.mock.instances[1]).toBe(password.instance);

    await act(async () => name.props.onChangeText('Ava'));
    await act(async () => email.props.onChangeText('ava@example.com'));
    await act(async () => password.props.onChangeText('secret1'));
    await act(async () => password.props.onSubmitEditing());
    expect(mockAuth.signUpWithEmail).toHaveBeenCalledWith('ava@example.com', 'secret1', 'Ava');
  });

  it('the reset email field sends the code, and the new password field resets', async () => {
    mockAuth.requestPasswordReset.mockResolvedValue(undefined);
    mockAuth.resetPasswordWithCode.mockResolvedValue({ session: null });
    const tree = await mount(<SignInScreen onGuestContinue={jest.fn()} />);
    await pressLabel(tree, 'Forgot password');

    await act(async () => placeholderOf(tree, 'Email address').props.onChangeText('a@b.co'));
    await act(async () => placeholderOf(tree, 'Email address').props.onSubmitEditing());
    expect(mockAuth.requestPasswordReset).toHaveBeenCalledWith('a@b.co');

    await act(async () => placeholderOf(tree, '6-digit code').props.onChangeText('123456'));
    await act(async () => placeholderOf(tree, 'New password').props.onChangeText('newpass1'));
    await act(async () => placeholderOf(tree, 'New password').props.onSubmitEditing());
    expect(mockAuth.resetPasswordWithCode).toHaveBeenCalledWith('a@b.co', '123456', 'newpass1');
  });
});

describe('Lookbook look form', () => {
  it('stays mounted while typing, so the keyboard does not close after one letter', async () => {
    const tree = await mount(<LookbookScreen />);
    await pressText(tree, '+ Add look');

    const title = placeholderOf(tree, 'e.g. Monday Power Look');
    const modals = tree.root.findAll(n => n.props.presentationStyle === 'pageSheet' && n.props.visible === true);
    expect(modals.length).toBeGreaterThan(0);

    await act(async () => title.props.onChangeText('M'));
    await act(async () => placeholderOf(tree, 'e.g. Monday Power Look').props.onChangeText('Mo'));

    const after = placeholderOf(tree, 'e.g. Monday Power Look');
    expect(after.instance).toBe(title.instance);
    expect(after.props.value).toBe('Mo');
    expect(tree.root.findAll(n => n.props.presentationStyle === 'pageSheet' && n.props.visible === true)[0]).toBe(
      modals[0],
    );
  });
});
