/**
 * After an item is added: it counts toward who the wardrobe is for and, when the owner has not said, nothing was
 * asked before and the things so far point clearly one way, asks once ("Is this a women's wardrobe?").
 * The real wardrobeAudience runs here, on the mocked AsyncStorage; only the account is faked.
 */
let mockUserId: string | null = null;
/** What the signed-in account's profile holds (user_metadata). */
let mockMetadata: Record<string, unknown> = {};
const mockUpdateUser = jest.fn();

jest.mock('../../src/services/authUser', () => ({
  getAuthUserId: async () => mockUserId,
}));
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockUserId ? { user: { id: mockUserId, user_metadata: mockMetadata } } : null } }),
      updateUser: (arg: unknown) => mockUpdateUser(arg),
    },
  },
}));

import { Alert, type AlertButton } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { noteAddedItem } from '../../src/utils/askWardrobeFor';
import { getWardrobeFor, setWardrobeFor, wasAsked, markAsked } from '../../src/services/wardrobeAudience';

const ANSWER = '@smartcloset_wardrobe_for';
const SIGNALS = '@smartcloset_wardrobe_for_signals';

type Method = 'getItem' | 'setItem' | 'removeItem';
const storage = AsyncStorage as unknown as Record<Method, jest.Mock>;
const realImpl: Record<Method, (...args: any[]) => any> = {
  getItem: storage.getItem.getMockImplementation()!,
  setItem: storage.setItem.getMockImplementation()!,
  removeItem: storage.removeItem.getMockImplementation()!,
};
const failOn = (method: Method, part = '') =>
  storage[method].mockImplementation((key: string, ...rest: unknown[]) =>
    key.includes(part) ? Promise.reject(new Error(`${method} failed`)) : realImpl[method](key, ...rest),
  );

let alert: jest.SpyInstance;
let warn: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  mockUserId = null;
  mockMetadata = {};
  mockUpdateUser.mockReset().mockResolvedValue({ data: {}, error: null });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const m of Object.keys(realImpl) as Method[]) storage[m].mockImplementation(realImpl[m]);
  jest.restoreAllMocks();
});

// Each of these points 4 or more toward one side on its own, enough to suggest it.
const COCKTAIL_DRESS = { category: 'dresses', subcategory: 'Cocktail dress', name: 'Satin dress' }; // women 4
const TIE = { category: 'accessories', subcategory: 'Tie', name: 'Silk tie', aiGender: 'men' }; // men 2 + 2
const MENS_TIE = { category: 'accessories', subcategory: 'Tie', name: "Men's silk tie" }; // men 2 + 3
const PLAIN_TIE = { category: 'accessories', subcategory: 'Tie', name: 'Silk tie' }; // men 2
const PLAIN_TEE = { category: 'tops', subcategory: 'T-shirt', name: 'Plain tee' };

const asked = () => alert.mock.calls.length;
const lastAlert = () => {
  const [title, message, buttons] = alert.mock.calls[alert.mock.calls.length - 1] as [string, string, AlertButton[]];
  return { title, message, buttons };
};
const buttonTexts = () => lastAlert().buttons.map(b => b.text);
const press = async (text: string) => {
  const button = lastAlert().buttons.find(b => b.text === text);
  if (!button) throw new Error(`no "${text}" button in ${JSON.stringify(buttonTexts())}`);
  await button.onPress?.();
};

describe('when it asks', () => {
  it("asks about a women's wardrobe once the things added point that way", async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    expect(asked()).toBe(1);
    expect(lastAlert().title).toBe("Is this a women's wardrobe?");
  });

  it("asks about a men's wardrobe when they point that way", async () => {
    await noteAddedItem(TIE);
    expect(asked()).toBe(1);
    expect(lastAlert().title).toBe("Is this a men's wardrobe?");
  });

  it('explains what the answer is for and where to change it', async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    const { message } = lastAlert();
    expect(message).toContain("looks like women's pieces");
    expect(message).toContain('Searches bring back the right fit');
    expect(message).toContain('photos are read with it in mind');
    expect(message).toContain('You can change this any time in Profile.');

    await AsyncStorage.clear();
    await noteAddedItem(TIE);
    expect(lastAlert().message).toContain("looks like men's pieces");
  });

  it('waits until there is enough: one dress is a hint, the second asks', async () => {
    await noteAddedItem({ category: 'dresses' });
    expect(asked()).toBe(0);
    await noteAddedItem({ category: 'dresses' });
    expect(asked()).toBe(1);
  });

  it('counts what was added before, even when the earlier additions did not ask', async () => {
    await noteAddedItem({ category: 'dresses' }, { ask: false });
    await noteAddedItem({ category: 'tops' });
    expect(asked()).toBe(0);
    await noteAddedItem({ category: 'dresses' });
    expect(asked()).toBe(1);
  });

  it('asks on the item that tips it, and counts the photo analysis toward it', async () => {
    await noteAddedItem({ category: 'tops', name: 'Shirt', aiGender: 'men' });
    expect(asked()).toBe(0);
    await noteAddedItem({ category: 'tops', name: 'Shirt', aiGender: 'men' });
    expect(asked()).toBe(1);
    expect(lastAlert().title).toBe("Is this a men's wardrobe?");
  });

  it('marks the question as asked as soon as it shows it', async () => {
    expect(await wasAsked()).toBe(false);
    await noteAddedItem(COCKTAIL_DRESS);
    expect(await wasAsked()).toBe(true);
  });

  it('asks a signed-in owner too, and a different account is asked on its own', async () => {
    mockUserId = 'a';
    await noteAddedItem(COCKTAIL_DRESS);
    expect(asked()).toBe(1);

    mockUserId = 'b';
    await noteAddedItem(COCKTAIL_DRESS);
    expect(asked()).toBe(2);

    // and not twice
    mockUserId = 'a';
    await noteAddedItem(COCKTAIL_DRESS);
    expect(asked()).toBe(2);
  });

  it('counts a guest\'s and an account\'s items separately', async () => {
    await noteAddedItem({ category: 'dresses' }); // guest: 2
    mockUserId = 'a';
    await noteAddedItem({ category: 'dresses' }); // account a: 2
    expect(asked()).toBe(0);
    mockUserId = null;
    await noteAddedItem({ category: 'dresses' }); // guest: 4
    expect(asked()).toBe(1);
  });
});

describe('when it does not ask', () => {
  it('does not ask a wardrobe that has been answered, whatever the items point to', async () => {
    for (const answer of ['women', 'men', 'both'] as const) {
      await AsyncStorage.clear();
      alert.mockClear();
      await setWardrobeFor(answer);
      await noteAddedItem(COCKTAIL_DRESS);
      await noteAddedItem(MENS_TIE);
      expect(asked()).toBe(0);
    }
  });

  it('does not change an answer it did not ask about', async () => {
    await setWardrobeFor('men');
    await noteAddedItem(COCKTAIL_DRESS);
    expect(await getWardrobeFor()).toBe('men');
  });

  it('does not ask a signed-in owner whose account was answered on another phone', async () => {
    mockUserId = 'a';
    // The profile holds the answer; nothing is on this device yet.
    mockMetadata = { wardrobe_for: 'both' };
    await noteAddedItem(COCKTAIL_DRESS);
    expect(asked()).toBe(0);
  });

  it('does not ask twice', async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    await noteAddedItem(COCKTAIL_DRESS);
    await noteAddedItem(COCKTAIL_DRESS);
    expect(asked()).toBe(1);
  });

  it('does not ask again after "Not now" or after the alert is dismissed', async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    await press('Not now');
    await noteAddedItem(COCKTAIL_DRESS);
    await noteAddedItem(COCKTAIL_DRESS);
    expect(asked()).toBe(1);
  });

  it('does not ask if it was asked before this device was set up (the flag is already set)', async () => {
    await markAsked();
    await noteAddedItem(COCKTAIL_DRESS);
    expect(asked()).toBe(0);
  });

  it('does not ask when the items point nowhere', async () => {
    for (let i = 0; i < 5; i++) await noteAddedItem(PLAIN_TEE);
    expect(asked()).toBe(0);
  });

  it('does not ask when they point both ways', async () => {
    await noteAddedItem({ category: 'dresses' }, { ask: false });
    await noteAddedItem({ category: 'dresses' }, { ask: false });
    await noteAddedItem(PLAIN_TIE, { ask: false });
    await noteAddedItem(PLAIN_TIE);
    expect(asked()).toBe(0);
  });

  it('does not ask while the other side has two points, however far ahead the first is', async () => {
    await noteAddedItem({ subcategory: 'Tie' }, { ask: false }); // men 2
    for (let i = 0; i < 6; i++) await noteAddedItem({ category: 'dresses' }); // women 12
    expect(asked()).toBe(0);
  });

  it('does not ask with ask: false, however clear it is, and does not use up the question', async () => {
    await noteAddedItem(COCKTAIL_DRESS, { ask: false });
    await noteAddedItem(COCKTAIL_DRESS, { ask: false });
    expect(asked()).toBe(0);
    expect(await wasAsked()).toBe(false);
    // the next item that can ask does
    await noteAddedItem(PLAIN_TEE);
    expect(asked()).toBe(1);
  });

  it('records the item even when it does not ask', async () => {
    await noteAddedItem(COCKTAIL_DRESS, { ask: false });
    expect(JSON.parse((await AsyncStorage.getItem(`${SIGNALS}:guest`)) as string)).toEqual({ women: 4, men: 0 });
    await setWardrobeFor('men');
    await noteAddedItem(COCKTAIL_DRESS);
    expect(JSON.parse((await AsyncStorage.getItem(`${SIGNALS}:guest`)) as string)).toEqual({ women: 8, men: 0 });
  });

  it('asks by default (no second argument)', async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    expect(asked()).toBe(1);
  });
});

describe('the question', () => {
  it("offers the app's guess first, then the other two, then Not now", async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    expect(buttonTexts()).toEqual(["Yes, Women's", "Men's", 'Both', 'Not now']);

    await AsyncStorage.clear();
    await noteAddedItem(TIE);
    expect(buttonTexts()).toEqual(["Yes, Men's", "Women's", 'Both', 'Not now']);
  });

  it('shows Not now as the cancel button, the others as plain answers', async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    const { buttons } = lastAlert();
    expect(buttons[buttons.length - 1]).toEqual({ text: 'Not now', style: 'cancel' });
    for (const b of buttons.slice(0, -1)) {
      expect(b.style).toBeUndefined();
      expect(typeof b.onPress).toBe('function');
    }
  });

  it('shows no other buttons than these four', async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    expect(lastAlert().buttons).toHaveLength(4);
  });
});

describe('each answer', () => {
  it.each([
    ["Yes, Women's", 'women'],
    ["Men's", 'men'],
    ['Both', 'both'],
  ] as const)('%s saves %s', async (text, expected) => {
    await noteAddedItem(COCKTAIL_DRESS);
    await press(text);
    expect(await getWardrobeFor()).toBe(expected);
    expect(await AsyncStorage.getItem(`${ANSWER}:guest`)).toBe(expected);
  });

  it.each([
    ["Yes, Men's", 'men'],
    ["Women's", 'women'],
    ['Both', 'both'],
  ] as const)('after the men\'s question, %s saves %s', async (text, expected) => {
    await noteAddedItem(TIE);
    await press(text);
    expect(await getWardrobeFor()).toBe(expected);
  });

  it("saves to the signed-in owner's account and copies it to the profile", async () => {
    mockUserId = 'a';
    await noteAddedItem(COCKTAIL_DRESS);
    await press("Yes, Women's");
    expect(await AsyncStorage.getItem(`${ANSWER}:u:a`)).toBe('women');
    expect(await AsyncStorage.getItem(`${ANSWER}:guest`)).toBeNull();
    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { wardrobe_for: 'women' } });
  });

  it('is not asked again after an answer, even when more items point the same way', async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    await press("Yes, Women's");
    await noteAddedItem(COCKTAIL_DRESS);
    expect(asked()).toBe(1);
  });

  it('can be a different answer from the guess', async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    await press('Both');
    expect(await getWardrobeFor()).toBe('both');
    await noteAddedItem(COCKTAIL_DRESS);
    expect(asked()).toBe(1);
  });

  it('Not now saves nothing', async () => {
    mockUserId = 'a';
    await noteAddedItem(COCKTAIL_DRESS);
    const notNow = lastAlert().buttons.find(b => b.text === 'Not now')!;
    await notNow.onPress?.();
    expect(await getWardrobeFor()).toBeNull();
    expect(await AsyncStorage.getItem(`${ANSWER}:u:a`)).toBeNull();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('Not now still counts as asked, so the question is not repeated', async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    await press('Not now');
    expect(await wasAsked()).toBe(true);
    await noteAddedItem(COCKTAIL_DRESS);
    expect(asked()).toBe(1);
    expect(await getWardrobeFor()).toBeNull();
  });

  it('an alert that is simply dismissed (no button) leaves it asked and unanswered', async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    expect(await wasAsked()).toBe(true);
    expect(await getWardrobeFor()).toBeNull();
  });

  it('a failing save does not throw out of the button, and nothing is saved', async () => {
    await noteAddedItem(COCKTAIL_DRESS);
    failOn('setItem', ANSWER);
    await expect(press("Yes, Women's")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[askWardrobeFor] could not save the answer:', expect.any(Error));
    storage.setItem.mockImplementation(realImpl.setItem);
    expect(await getWardrobeFor()).toBeNull();
  });

  it('a profile that cannot be reached does not stop the answer being saved on the device', async () => {
    mockUserId = 'a';
    mockUpdateUser.mockRejectedValue(new Error('offline'));
    await noteAddedItem(COCKTAIL_DRESS);
    await press('Both');
    expect(await getWardrobeFor()).toBe('both');
  });
});

describe('when storage fails', () => {
  it('never throws if nothing can be read', async () => {
    failOn('getItem');
    await expect(noteAddedItem(COCKTAIL_DRESS)).resolves.toBeUndefined();
  });

  it('never throws, and does not ask, if the item cannot be counted', async () => {
    failOn('setItem');
    await expect(noteAddedItem(COCKTAIL_DRESS)).resolves.toBeUndefined();
    expect(asked()).toBe(0);
  });

  it('never throws if the question cannot be marked as asked, and still shows it', async () => {
    failOn('setItem', '_asked');
    await expect(noteAddedItem(COCKTAIL_DRESS)).resolves.toBeUndefined();
    expect(asked()).toBe(1);
  });

  it('never throws if the alert itself fails', async () => {
    alert.mockImplementation(() => {
      throw new Error('no window');
    });
    await expect(noteAddedItem(COCKTAIL_DRESS)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[askWardrobeFor] failed:', expect.any(Error));
  });

  it('never throws for an item with nothing in it', async () => {
    await expect(noteAddedItem({})).resolves.toBeUndefined();
    expect(asked()).toBe(0);
  });
});
