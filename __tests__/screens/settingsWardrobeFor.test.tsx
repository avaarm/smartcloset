/**
 * Settings > Wardrobe > "This wardrobe is for": the saved answer is lit, tapping another saves it (and counts the
 * question as answered), and a save that fails puts the earlier answer back and says so.
 * The real wardrobeAudience and AsyncStorage run underneath; the mocks only let a test make a save fail or wait.
 */
import 'react-native';
import React from 'react';
import { Alert, Pressable, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SettingsScreen from '../../src/screens/SettingsScreen';
import * as audience from '../../src/services/wardrobeAudience';

let mockSignedIn = true;
/** What the signed-in account's profile holds (user_metadata) besides the name. */
let mockProfile: Record<string, unknown> = {};
const mockUpdateUser = jest.fn();
const mockGetWardrobeFor = jest.fn();
const mockSetWardrobeFor = jest.fn();
const mockMarkAsked = jest.fn();

jest.mock('../../src/config/features', () => ({ PRO_MODES_ENABLED: false }));
jest.mock('../../src/context/AccountModeContext', () => ({
  useAccountMode: () => ({ currentMode: 'user', switchMode: jest.fn() }),
}));
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: mockSignedIn
            ? { user: { id: 'u1', email: 'ada@example.com', user_metadata: { name: 'Ada Lovelace', ...mockProfile } } }
            : null,
        },
      }),
      updateUser: (arg: unknown) => mockUpdateUser(arg),
    },
  },
}));
jest.mock('../../src/services/wardrobeAudience', () => ({
  ...jest.requireActual('../../src/services/wardrobeAudience'),
  getWardrobeFor: () => mockGetWardrobeFor(),
  setWardrobeFor: (v: unknown) => mockSetWardrobeFor(v),
  markAsked: () => mockMarkAsked(),
}));
jest.mock('../../src/services/backupService', () => ({
  saveAndShareBackup: jest.fn(),
  clearAllData: jest.fn(),
  getBackupStats: jest.fn(async () => ({ itemsCount: 3, outfitsCount: 1, storageSize: 2048 })),
}));
jest.mock('../../src/services/seedDemoData', () => ({ reseedAllDemoData: jest.fn() }));
jest.mock('../../src/services/storage', () => ({ resetStorage: jest.fn() }));
jest.mock('../../src/services/productContributions', () => ({
  getContributionHistory: jest.fn(async () => []),
  isSharingEnabled: jest.fn(async () => false),
  setSharingEnabled: jest.fn(),
  deleteMySharedContributions: jest.fn(),
}));
jest.mock('../../src/services/accountDeletion', () => ({ deleteAccount: jest.fn() }));
jest.mock('../../src/services/aiConsent', () => ({
  getAiConsent: jest.fn(async () => null),
  setAiConsent: jest.fn(),
}));
jest.mock('../../src/services/authService', () => ({ signOut: jest.fn() }));

const actual = jest.requireActual('../../src/services/wardrobeAudience') as typeof audience;

const ANSWER = '@smartcloset_wardrobe_for';
const ASKED = '@smartcloset_wardrobe_for_asked';

let tree: renderer.ReactTestRenderer;
let alert: jest.SpyInstance;

const render = async () => {
  await act(async () => {
    tree = renderer.create(<SettingsScreen />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise(r => setImmediate(r));
  });
};

const textsOf = () => tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
const group = () =>
  tree.root.find(n => n.props.accessibilityRole === 'radiogroup' && n.props.accessibilityLabel === 'This wardrobe is for');
const chip = (label: string) => {
  const found = group().findAllByType(Pressable).filter(n => n.props.accessibilityLabel === label);
  if (found.length === 0) throw new Error(`no chip "${label}"`);
  return found[0];
};
const lit = () =>
  group()
    .findAllByType(Pressable)
    .filter(n => n.props.accessibilityState?.selected)
    .map(n => n.props.accessibilityLabel);
const press = (label: string) => act(async () => chip(label).props.onPress());
const raw = (key: string) => AsyncStorage.getItem(key);

const defer = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const devFlag = (global as any).__DEV__;

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSignedIn = true;
  mockProfile = {};
  (global as any).__DEV__ = false;
  mockUpdateUser.mockReset().mockResolvedValue({ data: {}, error: null });
  // By default the real thing, on the mocked storage.
  mockGetWardrobeFor.mockReset().mockImplementation(() => actual.getWardrobeFor());
  mockSetWardrobeFor.mockReset().mockImplementation(v => actual.setWardrobeFor(v as any));
  mockMarkAsked.mockReset().mockImplementation(() => actual.markAsked());
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  act(() => tree?.unmount());
  (global as any).__DEV__ = devFlag;
  jest.restoreAllMocks();
});

describe('the Wardrobe section', () => {
  it('is there, with its question and the three answers, for a signed-in owner', async () => {
    await render();
    const texts = textsOf();
    expect(texts).toContain('Wardrobe');
    expect(texts).toContain('This wardrobe is for');
    expect(texts.some(t => t.includes('Searches bring back the right fit'))).toBe(true);
    expect(group().findAllByType(Pressable).map(n => n.props.accessibilityLabel)).toEqual(["Women's", "Men's", 'Both']);
  });

  it('is there for a guest too', async () => {
    mockSignedIn = false;
    await render();
    expect(textsOf()).toContain('This wardrobe is for');
    expect(group().findAllByType(Pressable)).toHaveLength(3);
  });

  it('lights nothing when there is no answer yet', async () => {
    await render();
    expect(lit()).toEqual([]);
  });

  it.each([
    ['women', "Women's"],
    ['men', "Men's"],
    ['both', 'Both'],
  ] as const)('lights %s when that is the saved answer', async (saved, label) => {
    await AsyncStorage.setItem(`${ANSWER}:u:u1`, saved);
    await render();
    expect(lit()).toEqual([label]);
  });

  it("shows a guest's own answer", async () => {
    mockSignedIn = false;
    await AsyncStorage.setItem(`${ANSWER}:guest`, 'men');
    await render();
    expect(lit()).toEqual(["Men's"]);
  });

  it("does not show another account's or the guest's answer", async () => {
    await AsyncStorage.setItem(`${ANSWER}:u:someone-else`, 'men');
    await AsyncStorage.setItem(`${ANSWER}:guest`, 'both');
    await render();
    expect(lit()).toEqual([]);
  });

  it('shows the answer the account got on another phone, and keeps a copy on this one', async () => {
    // Not on this device, but on the profile: the real getWardrobeFor reads it.
    mockProfile = { wardrobe_for: 'women' };
    await render();
    expect(lit()).toEqual(["Women's"]);
    expect(await raw(`${ANSWER}:u:u1`)).toBe('women');
  });

  it('still shows the choices, unlit, when the saved answer cannot be read', async () => {
    mockGetWardrobeFor.mockRejectedValue(new Error('storage down'));
    await render();
    expect(lit()).toEqual([]);
    expect(group().findAllByType(Pressable)).toHaveLength(3);
    expect(textsOf()).toContain('Sign Out');
  });
});

describe('choosing', () => {
  it('lights the chip, saves the answer under this account and copies it to the profile', async () => {
    await render();
    await press("Women's");
    expect(lit()).toEqual(["Women's"]);
    expect(mockSetWardrobeFor).toHaveBeenCalledTimes(1);
    expect(mockSetWardrobeFor).toHaveBeenCalledWith('women');
    expect(await raw(`${ANSWER}:u:u1`)).toBe('women');
    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { wardrobe_for: 'women' } });
    expect(alert).not.toHaveBeenCalled();
  });

  it('saves a guest\'s answer under the guest key and has nothing to copy', async () => {
    mockSignedIn = false;
    await render();
    await press('Both');
    expect(lit()).toEqual(['Both']);
    expect(await raw(`${ANSWER}:guest`)).toBe('both');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["Women's", 'women'],
    ["Men's", 'men'],
    ['Both', 'both'],
  ] as const)('%s saves %s', async (label, value) => {
    await render();
    await press(label);
    expect(mockSetWardrobeFor).toHaveBeenCalledWith(value);
  });

  it('counts the question as answered, so the app does not ask again', async () => {
    await render();
    expect(await raw(`${ASKED}:u:u1`)).toBeNull();
    await press("Men's");
    expect(mockMarkAsked).toHaveBeenCalledTimes(1);
    expect(await raw(`${ASKED}:u:u1`)).toBe('true');
    expect(await actual.wasAsked()).toBe(true);
  });

  it('saves the answer first and marks the question asked after it', async () => {
    const order: string[] = [];
    mockSetWardrobeFor.mockImplementation(async () => void order.push('set'));
    mockMarkAsked.mockImplementation(async () => void order.push('asked'));
    await render();
    await press('Both');
    expect(order).toEqual(['set', 'asked']);
  });

  it('lights the chip at once, while the save is still going', async () => {
    const saving = defer<void>();
    mockSetWardrobeFor.mockReturnValue(saving.promise);
    await render();
    await press("Men's");
    expect(lit()).toEqual(["Men's"]);
    expect(mockMarkAsked).not.toHaveBeenCalled();
    await act(async () => saving.resolve());
    expect(lit()).toEqual(["Men's"]);
    expect(mockMarkAsked).toHaveBeenCalledTimes(1);
  });

  it('changes an answer already saved', async () => {
    await AsyncStorage.setItem(`${ANSWER}:u:u1`, 'men');
    await render();
    await press('Both');
    expect(lit()).toEqual(['Both']);
    expect(await raw(`${ANSWER}:u:u1`)).toBe('both');
    await press("Women's");
    expect(lit()).toEqual(["Women's"]);
    expect(await raw(`${ANSWER}:u:u1`)).toBe('women');
  });

  it('does not save again when the lit chip is tapped', async () => {
    await AsyncStorage.setItem(`${ANSWER}:u:u1`, 'men');
    await render();
    await press("Men's");
    expect(mockSetWardrobeFor).not.toHaveBeenCalled();
    expect(mockMarkAsked).not.toHaveBeenCalled();
    expect(lit()).toEqual(["Men's"]);
  });

  it('keeps the answer after the screen is closed and opened again', async () => {
    await render();
    await press("Women's");
    act(() => tree.unmount());
    await render();
    expect(lit()).toEqual(["Women's"]);
  });

  it('does not touch the other people\'s answers', async () => {
    await AsyncStorage.setItem(`${ANSWER}:guest`, 'men');
    await AsyncStorage.setItem(`${ANSWER}:u:other`, 'both');
    await render();
    await press("Women's");
    expect(await raw(`${ANSWER}:guest`)).toBe('men');
    expect(await raw(`${ANSWER}:u:other`)).toBe('both');
  });
});

describe('a save that fails', () => {
  it('puts back the empty state, says so, and does not mark the question asked', async () => {
    mockSetWardrobeFor.mockRejectedValue(new Error('disk full'));
    await render();
    await press("Women's");
    expect(lit()).toEqual([]);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith("Couldn't save that", 'Please try again.');
    expect(mockMarkAsked).not.toHaveBeenCalled();
    expect(await raw(`${ANSWER}:u:u1`)).toBeNull();
  });

  it('puts back the earlier answer', async () => {
    await AsyncStorage.setItem(`${ANSWER}:u:u1`, 'men');
    mockSetWardrobeFor.mockRejectedValue(new Error('disk full'));
    await render();
    await press("Women's");
    expect(lit()).toEqual(["Men's"]);
    expect(alert).toHaveBeenCalledWith("Couldn't save that", 'Please try again.');
    expect(await raw(`${ANSWER}:u:u1`)).toBe('men');
  });

  it('shows the chip lit while it is trying, then takes it back', async () => {
    const saving = defer<void>();
    mockSetWardrobeFor.mockReturnValue(saving.promise);
    await AsyncStorage.setItem(`${ANSWER}:u:u1`, 'both');
    await render();
    await press("Men's");
    expect(lit()).toEqual(["Men's"]);
    await act(async () => saving.reject(new Error('disk full')));
    expect(lit()).toEqual(['Both']);
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('can be tried again, and then it saves', async () => {
    mockSetWardrobeFor.mockRejectedValueOnce(new Error('disk full'));
    await render();
    await press('Both');
    expect(lit()).toEqual([]);
    await press('Both');
    expect(lit()).toEqual(['Both']);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(await raw(`${ANSWER}:u:u1`)).toBe('both');
    expect(mockMarkAsked).toHaveBeenCalledTimes(1);
  });

  it('when the device itself refuses the write', async () => {
    const setItem = AsyncStorage.setItem as jest.Mock;
    const real = setItem.getMockImplementation()!;
    setItem.mockImplementation((key: string, ...rest: unknown[]) =>
      key === `${ANSWER}:u:u1` ? Promise.reject(new Error('setItem failed')) : real(key, ...rest),
    );
    try {
      await render();
      await press("Men's");
      expect(lit()).toEqual([]);
      expect(alert).toHaveBeenCalledWith("Couldn't save that", 'Please try again.');
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(await raw(`${ASKED}:u:u1`)).toBeNull();
    } finally {
      setItem.mockImplementation(real);
    }
  });

  it('does not alert when the save works but only the copy to the profile fails', async () => {
    mockUpdateUser.mockRejectedValue(new Error('offline'));
    await render();
    await press("Women's");
    expect(lit()).toEqual(["Women's"]);
    expect(alert).not.toHaveBeenCalled();
    expect(await raw(`${ANSWER}:u:u1`)).toBe('women');
  });
});
