/**
 * Home: "Who is this wardrobe for?" is asked on a card until the owner answers, with what the wardrobe suggests
 * when it points clearly one way. Choosing saves the answer, counts the question as asked and hides the card; a
 * save that fails says so and keeps the card. The real wardrobeAudience and AsyncStorage run underneath.
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
import { recordAudienceSignal } from '../../src/services/wardrobeAudience';
import type { ClothingItem } from '../../src/types';

let mockSession: any = null;
const mockUpdateUser = jest.fn();

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      updateUser: (arg: unknown) => mockUpdateUser(arg),
    },
  },
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

const mockFocus: { current: null | (() => void) } = { current: null };
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({ navigate: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      mockFocus.current = cb;
      React.useEffect(cb, [cb]);
    },
  };
});

const mockItems = getClothingItems as jest.Mock;
const mockOutfits = getSavedOutfits as jest.Mock;

const ANSWER = '@smartcloset_wardrobe_for';
const SIGNALS = '@smartcloset_wardrobe_for_signals';
const ASKED = '@smartcloset_wardrobe_for_asked';

const TITLE = 'Who is this wardrobe for?';
const GENERIC = 'Searches bring back the right fit, and photos are read with it in mind.';
const womens = "What you've added looks like a women's wardrobe. Is that right?";
const mens = "What you've added looks like a men's wardrobe. Is that right?";

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};
const text = (tree: renderer.ReactTestRenderer) => flatten(tree.toJSON());

let n = 0;
const item = (extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id: `i${++n}`,
  name: `Item ${n}`,
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});
const tees = () => [item(), item(), item()];
const dresses = (count: number, extra: Partial<ClothingItem> = {}) =>
  Array.from({ length: count }, () => item({ category: 'dresses', ...extra }));
const ties = (count: number) => Array.from({ length: count }, () => item({ category: 'accessories', subcategory: 'Tie' }));

const signIn = () => {
  mockSession = { user: { id: 'u1', email: 'ada@example.com', user_metadata: { name: 'Ada' } } };
};

let tree: renderer.ReactTestRenderer;
let alert: jest.SpyInstance;

const mount = async () => {
  await act(async () => {
    tree = renderer.create(<HomeScreen />);
  });
  await act(async () => {
    await new Promise(r => setImmediate(r));
  });
  return tree;
};
const refocus = async () => {
  await act(async () => {
    mockFocus.current!();
  });
  await act(async () => {
    await new Promise(r => setImmediate(r));
  });
};

const cardShown = () => text(tree).includes(TITLE);
const choices = () => {
  const groups = tree.root.findAll(
    n => n.props.accessibilityRole === 'radiogroup' && n.props.accessibilityLabel === 'This wardrobe is for',
  );
  return groups.length > 0 ? groups[0].findAllByType(Pressable) : [];
};
const choose = async (label: string) => {
  const target = choices().find(c => c.props.accessibilityLabel === label);
  if (!target) throw new Error(`no choice "${label}"`);
  await act(async () => {
    await target.props.onPress();
  });
  await act(async () => {
    await new Promise(r => setImmediate(r));
  });
};
const raw = (key: string) => AsyncStorage.getItem(key);

type Method = 'setItem' | 'getItem';
const realImpl = {
  setItem: (AsyncStorage.setItem as jest.Mock).getMockImplementation()!,
  getItem: (AsyncStorage.getItem as jest.Mock).getMockImplementation()!,
};
const failWrites = (part: string) =>
  (AsyncStorage.setItem as jest.Mock).mockImplementation((key: string, ...rest: unknown[]) =>
    key.includes(part) ? Promise.reject(new Error('disk full')) : realImpl.setItem(key, ...rest),
  );

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSession = null;
  mockItems.mockReset().mockResolvedValue(tees());
  mockOutfits.mockReset().mockResolvedValue([]);
  (getBodyProfile as jest.Mock).mockReset().mockResolvedValue(null);
  mockUpdateUser.mockReset().mockResolvedValue({ data: {}, error: null });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  act(() => tree?.unmount());
  for (const m of Object.keys(realImpl) as Method[]) (AsyncStorage[m] as jest.Mock).mockImplementation(realImpl[m]);
  jest.restoreAllMocks();
});

describe('the card', () => {
  it('is there while the wardrobe has no answer, with the three choices and none lit', async () => {
    signIn();
    await mount();
    expect(cardShown()).toBe(true);
    expect(choices().map(c => c.props.accessibilityLabel)).toEqual(["Women's", "Men's", 'Both']);
    expect(choices().filter(c => c.props.accessibilityState?.selected)).toHaveLength(0);
  });

  it('is there for a guest too', async () => {
    await mount();
    expect(cardShown()).toBe(true);
    expect(text(tree)).toContain(GENERIC);
  });

  it('says what it is for when it has nothing to suggest', async () => {
    signIn();
    await mount();
    expect(text(tree)).toContain(GENERIC);
    expect(text(tree)).not.toContain('Is that right?');
  });

  it("suggests a women's wardrobe for a wardrobe of dresses", async () => {
    signIn();
    mockItems.mockResolvedValue([...dresses(3), item()]);
    await mount();
    expect(text(tree)).toContain(womens);
    expect(text(tree)).not.toContain(GENERIC);
  });

  it("suggests a men's wardrobe for a wardrobe of ties and men's pieces", async () => {
    signIn();
    mockItems.mockResolvedValue([...ties(2), item()]);
    await mount();
    expect(text(tree)).toContain(mens);
  });

  it('reads the names too', async () => {
    signIn();
    mockItems.mockResolvedValue([item({ name: "Women's wool coat" }), item()]);
    await mount();
    expect(text(tree)).toContain(womens);
  });

  it('does not suggest from a single dress', async () => {
    signIn();
    mockItems.mockResolvedValue([...dresses(1), item(), item()]);
    await mount();
    expect(text(tree)).toContain(GENERIC);
  });

  it('does not suggest for a wardrobe that points both ways', async () => {
    signIn();
    mockItems.mockResolvedValue([...dresses(4), ...ties(2)]);
    await mount();
    expect(text(tree)).toContain(GENERIC);
  });

  it('does not count the wishlist', async () => {
    signIn();
    mockItems.mockResolvedValue([...dresses(4, { isWishlist: true }), item()]);
    await mount();
    expect(text(tree)).toContain(GENERIC);
  });

  it("does not suggest from a guest's wardrobe, which is the demo one", async () => {
    mockItems.mockResolvedValue(dresses(5));
    await mount();
    expect(cardShown()).toBe(true);
    expect(text(tree)).toContain(GENERIC);
    expect(await raw(`${SIGNALS}:guest`)).toBeNull();
  });

  it("suggests from what a guest added themselves", async () => {
    await recordAudienceSignal({ category: 'dresses' });
    await recordAudienceSignal({ category: 'dresses' });
    mockItems.mockResolvedValue(tees());
    await mount();
    expect(text(tree)).toContain(womens);
  });

  it('uses the running total of what was added rather than counting the items again', async () => {
    signIn();
    await AsyncStorage.setItem(`${SIGNALS}:u:u1`, JSON.stringify({ women: 0, men: 6 }));
    mockItems.mockResolvedValue(dresses(5));
    await mount();
    expect(text(tree)).toContain(mens);
  });

  it('keeps that running total instead of recounting an old wardrobe each time', async () => {
    signIn();
    mockItems.mockResolvedValue(dresses(3));
    await mount();
    expect(JSON.parse((await raw(`${SIGNALS}:u:u1`))!)).toEqual({ women: 6, men: 0 });
    // more dresses arrive without being recorded: the total is what counts now
    mockItems.mockResolvedValue(dresses(10));
    await refocus();
    expect(JSON.parse((await raw(`${SIGNALS}:u:u1`))!)).toEqual({ women: 6, men: 0 });
  });

  it('is still there, with nothing to suggest, when the wardrobe does not load', async () => {
    signIn();
    mockItems.mockRejectedValue(new Error('offline'));
    await mount();
    expect(cardShown()).toBe(true);
    expect(text(tree)).toContain(GENERIC);
  });

  it('is there for an empty wardrobe too', async () => {
    signIn();
    mockItems.mockResolvedValue([]);
    await mount();
    expect(text(tree)).toContain('Your wardrobe is empty');
    expect(cardShown()).toBe(true);
  });

  it('is not shown before the answer has been read', async () => {
    signIn();
    let release!: (v: ClothingItem[]) => void;
    mockItems.mockReturnValue(new Promise<ClothingItem[]>(res => (release = res)));
    await mount();
    expect(cardShown()).toBe(false);
    await act(async () => release(tees()));
    await act(async () => {
      await new Promise(r => setImmediate(r));
    });
    expect(cardShown()).toBe(true);
  });

  it.each(['women', 'men', 'both'])('never shows for a wardrobe answered %s, however it looks', async answer => {
    signIn();
    await AsyncStorage.setItem(`${ANSWER}:u:u1`, answer);
    mockItems.mockResolvedValue(dresses(5));
    await mount();
    expect(cardShown()).toBe(false);
    expect(choices()).toHaveLength(0);
    expect(text(tree)).not.toContain('Is that right?');
  });

  it('never shows for a guest who answered', async () => {
    await AsyncStorage.setItem(`${ANSWER}:guest`, 'men');
    await mount();
    expect(cardShown()).toBe(false);
  });

  it("never shows for an account answered on another phone", async () => {
    mockSession = { user: { id: 'u1', email: 'a@b.c', user_metadata: { name: 'Ada', wardrobe_for: 'women' } } };
    await mount();
    expect(cardShown()).toBe(false);
  });

  it("is still there for an account when only someone else (or the guest) answered", async () => {
    signIn();
    await AsyncStorage.setItem(`${ANSWER}:guest`, 'men');
    await AsyncStorage.setItem(`${ANSWER}:u:someone-else`, 'both');
    await mount();
    expect(cardShown()).toBe(true);
  });

  it('is not hidden by the question having been asked and left ("Not now")', async () => {
    signIn();
    await AsyncStorage.setItem(`${ASKED}:u:u1`, 'true');
    await mount();
    expect(cardShown()).toBe(true);
  });

  it('goes away when the answer is given elsewhere (Settings) and the tab is shown again', async () => {
    signIn();
    await mount();
    expect(cardShown()).toBe(true);
    await AsyncStorage.setItem(`${ANSWER}:u:u1`, 'men');
    await refocus();
    expect(cardShown()).toBe(false);
  });

  it('shows what was added since, when the tab is shown again', async () => {
    signIn();
    await mount();
    expect(text(tree)).toContain(GENERIC);
    await recordAudienceSignal({ category: 'dresses' });
    await recordAudienceSignal({ category: 'dresses' });
    await refocus();
    expect(text(tree)).toContain(womens);
  });
});

describe('choosing', () => {
  it.each([
    ["Women's", 'women'],
    ["Men's", 'men'],
    ['Both', 'both'],
  ] as const)('%s saves %s for a guest, counts the question as asked and hides the card', async (label, value) => {
    await mount();
    await choose(label);
    expect(await raw(`${ANSWER}:guest`)).toBe(value);
    expect(await raw(`${ASKED}:guest`)).toBe('true');
    expect(cardShown()).toBe(false);
    expect(alert).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('saves a signed-in owner\'s answer under the account and copies it to the profile', async () => {
    signIn();
    await mount();
    await choose("Women's");
    expect(await raw(`${ANSWER}:u:u1`)).toBe('women');
    expect(await raw(`${ASKED}:u:u1`)).toBe('true');
    expect(await raw(`${ANSWER}:guest`)).toBeNull();
    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { wardrobe_for: 'women' } });
    expect(cardShown()).toBe(false);
  });

  it('can answer something other than the suggestion', async () => {
    signIn();
    mockItems.mockResolvedValue(dresses(3));
    await mount();
    expect(text(tree)).toContain(womens);
    await choose('Both');
    expect(await raw(`${ANSWER}:u:u1`)).toBe('both');
    expect(cardShown()).toBe(false);
  });

  it('stays gone when the tab is shown again', async () => {
    signIn();
    await mount();
    await choose("Men's");
    await refocus();
    expect(cardShown()).toBe(false);
  });

  it('stays gone for the next visit, after the screen is closed and opened again', async () => {
    signIn();
    await mount();
    await choose("Men's");
    act(() => tree.unmount());
    await mount();
    expect(cardShown()).toBe(false);
  });

  it('hides the card at once, while the answer is still being saved', async () => {
    signIn();
    let finish!: () => void;
    (AsyncStorage.setItem as jest.Mock).mockImplementation((key: string, ...rest: unknown[]) =>
      key === `${ANSWER}:u:u1`
        ? new Promise<void>(res => (finish = () => res(realImpl.setItem(key, ...rest))))
        : realImpl.setItem(key, ...rest),
    );
    await mount();
    const target = choices().find(c => c.props.accessibilityLabel === 'Both')!;
    await act(async () => {
      target.props.onPress();
    });
    expect(cardShown()).toBe(false);
    expect(await raw(`${ASKED}:u:u1`)).toBeNull(); // not yet: the answer is not saved
    await act(async () => finish());
    await act(async () => {
      await new Promise(r => setImmediate(r));
    });
    expect(await raw(`${ANSWER}:u:u1`)).toBe('both');
    expect(await raw(`${ASKED}:u:u1`)).toBe('true');
    expect(cardShown()).toBe(false);
  });

  describe('when saving fails', () => {
    it('says so, keeps the card, and saves nothing', async () => {
      signIn();
      await mount();
      failWrites(ANSWER + ':');
      await choose("Women's");
      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith("Couldn't save that", 'Please try again.');
      expect(cardShown()).toBe(true);
      expect(await raw(`${ANSWER}:u:u1`)).toBeNull();
      expect(await raw(`${ASKED}:u:u1`)).toBeNull();
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('keeps the suggestion in the card', async () => {
      signIn();
      mockItems.mockResolvedValue(dresses(3));
      await mount();
      failWrites(ANSWER + ':');
      await choose("Men's");
      expect(text(tree)).toContain(womens);
    });

    it('lets the owner try again, and then it saves and hides the card', async () => {
      signIn();
      await mount();
      failWrites(ANSWER + ':');
      await choose("Men's");
      expect(cardShown()).toBe(true);

      (AsyncStorage.setItem as jest.Mock).mockImplementation(realImpl.setItem);
      await choose("Men's");
      expect(alert).toHaveBeenCalledTimes(1);
      expect(await raw(`${ANSWER}:u:u1`)).toBe('men');
      expect(cardShown()).toBe(false);
    });

    it('says so for a guest too', async () => {
      await mount();
      failWrites(ANSWER + ':guest');
      await choose('Both');
      expect(alert).toHaveBeenCalledWith("Couldn't save that", 'Please try again.');
      expect(cardShown()).toBe(true);
    });
  });

  it('does not take the answer back, or alert, when only the copy to the profile fails', async () => {
    signIn();
    mockUpdateUser.mockRejectedValue(new Error('offline'));
    await mount();
    await choose("Women's");
    expect(await raw(`${ANSWER}:u:u1`)).toBe('women');
    expect(alert).not.toHaveBeenCalled();
    expect(cardShown()).toBe(false);
  });

  it('does not take the answer back, or alert, when only remembering that it was asked fails', async () => {
    signIn();
    await mount();
    failWrites(ASKED);
    await choose("Women's");
    expect(await raw(`${ANSWER}:u:u1`)).toBe('women');
    expect(alert).not.toHaveBeenCalled();
    expect(cardShown()).toBe(false);
  });
});
