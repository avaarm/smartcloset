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

// The setup file's picker mock has no <Picker.Item>, which the recommendation form renders.
jest.mock('@react-native-picker/picker', () => {
  const Picker: any = () => null;
  Picker.Item = () => null;
  return { Picker };
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

const client = { id: 'c1', name: 'Ava Lee', email: 'ava@example.com', status: 'active' };
jest.mock('../../src/services/stylistService', () => ({
  getClients: jest.fn(async () => [client]),
  getActiveClients: jest.fn(async () => [client]),
  getStylistProfile: jest.fn(async () => null),
  getRecommendations: jest.fn(async () => []),
  createAppointment: jest.fn(),
  createRecommendation: jest.fn(),
  addClient: jest.fn(),
  updateClient: jest.fn(),
}));
jest.mock('../../src/services/marketplaceService', () => ({
  getCurrentClientAccount: jest.fn(async () => null),
  createClientAccount: jest.fn(),
  createBookingRequest: jest.fn(),
  getStylistListings: jest.fn(async () => []),
  getFeaturedStylists: jest.fn(async () => []),
  searchStylists: jest.fn(async () => []),
}));
jest.mock('../../src/services/messagingService', () => ({
  getThreads: jest.fn(async () => []),
  getMessages: jest.fn(async () => []),
  sendMessage: jest.fn(),
  markThreadAsRead: jest.fn(async () => undefined),
}));

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
import BookStylistScreen from '../../src/screens/BookStylistScreen';
import CreateAppointmentScreen from '../../src/screens/CreateAppointmentScreen';
import CreateRecommendationScreen from '../../src/screens/CreateRecommendationScreen';
import AddClientScreen from '../../src/screens/AddClientScreen';
import ChatScreen from '../../src/screens/ChatScreen';
import MessagesListScreen from '../../src/screens/MessagesListScreen';
import ClientsListScreen from '../../src/screens/ClientsListScreen';
import RecommendationsScreen from '../../src/screens/RecommendationsScreen';
import StylistMarketplaceScreen from '../../src/screens/StylistMarketplaceScreen';
import UserSafetySheet from '../../src/components/UserSafetySheet';

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
};

const nav = () => ({ goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() });

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
    open: tree => pressText(tree, 'Text'),
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
    name: 'Book a stylist',
    element: () => (
      <BookStylistScreen
        route={{ params: { stylistId: 's1', stylistName: 'Sam', consultationFee: 100 } }}
        navigation={nav()}
      />
    ),
    safe: 'scroll',
  },
  {
    name: 'New appointment',
    element: () => <CreateAppointmentScreen navigation={nav() as any} route={{ params: {} } as any} />,
    safe: 'scroll',
  },
  { name: 'New recommendation', element: () => <CreateRecommendationScreen navigation={nav()} />, safe: 'scroll' },
  { name: 'Add client', element: () => <AddClientScreen navigation={nav()} />, safe: 'scroll' },
  {
    name: 'Chat',
    element: () => (
      <ChatScreen
        route={{ params: { threadId: 't1', contactName: 'Sam', stylistId: 's1', clientId: 'c1' } }}
        navigation={nav()}
      />
    ),
    safe: 'avoiding',
  },
  { name: 'Messages list', element: () => <MessagesListScreen navigation={nav()} route={{}} />, safe: 'below' },
  { name: 'Clients list', element: () => <ClientsListScreen navigation={nav() as any} />, safe: 'below' },
  { name: 'Recommendations list', element: () => <RecommendationsScreen navigation={nav() as any} />, safe: 'below' },
  { name: 'Stylist marketplace', element: () => <StylistMarketplaceScreen navigation={nav()} />, safe: 'below' },
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
        expect(inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
      } else {
        expect(RETURN_KEYS).toContain(returnKeyType);
        // Return either moves on to the next field or closes the keyboard.
        expect(returnKeyType === 'next' || blurOnSubmit !== false).toBe(true);
      }
    }

    // The bar is rendered once; a form may show it before the step that needs it.
    const bars = tree.root.findAllByType(InputAccessoryView);
    expect(bars.length).toBeLessThanOrEqual(1);
    if (inputs.some(i => i.props.inputAccessoryViewID === KEYBOARD_DONE_ID)) {
      expect(bars).toHaveLength(1);
      expect(bars[0].props.nativeID).toBe(KEYBOARD_DONE_ID);
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

describe('Chat input bar', () => {
  it('is lifted by the keyboard height alone: nothing sits above the screen, so no offset', async () => {
    const tree = await mount(
      <ChatScreen
        route={{ params: { threadId: 't1', contactName: 'Sam', stylistId: 's1', clientId: 'c1' } }}
        navigation={nav()}
      />,
    );
    const lifter = tree.root.findByType(KeyboardAvoidingView);
    expect(lifter.props.keyboardVerticalOffset ?? 0).toBe(0);
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
