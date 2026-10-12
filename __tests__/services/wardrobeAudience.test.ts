/**
 * Who the wardrobe is for (women's / men's / both): the saved answer, kept per account on the device and copied
 * best-effort to the account's profile; what the things added so far point to; and the "already asked" flag.
 */
let mockUserId: string | null = null;
const mockGetSession = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock('../../src/services/authUser', () => ({
  getAuthUserId: async () => {
    if (mockUserId === 'THROW') throw new Error('auth down');
    return mockUserId;
  },
}));
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      updateUser: (arg: unknown) => mockUpdateUser(arg),
    },
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SUGGESTION_LEAD,
  WARDROBE_FOR_OPTIONS,
  audienceSignal,
  getAudienceSuggestion,
  getWardrobeFor,
  isWardrobeFor,
  markAsked,
  recordAudienceSignal,
  setWardrobeFor,
  suggestAudience,
  wardrobeForLabel,
  wasAsked,
} from '../../src/services/wardrobeAudience';
import { CLOTHING_TYPES } from '../../src/utils/clothingTypes';

const ANSWER = '@smartcloset_wardrobe_for';
const SIGNALS = '@smartcloset_wardrobe_for_signals';
const ASKED = '@smartcloset_wardrobe_for_asked';

type Method = 'getItem' | 'setItem' | 'removeItem';
const storage = AsyncStorage as unknown as Record<Method, jest.Mock>;
const realImpl: Record<Method, (...args: any[]) => any> = {
  getItem: storage.getItem.getMockImplementation()!,
  setItem: storage.setItem.getMockImplementation()!,
  removeItem: storage.removeItem.getMockImplementation()!,
};
/** Makes one storage method fail for keys containing `part` (every key when omitted); the others keep working. */
const failOn = (method: Method, part = '') =>
  storage[method].mockImplementation((key: string, ...rest: unknown[]) =>
    key.includes(part) ? Promise.reject(new Error(`${method} failed`)) : realImpl[method](key, ...rest),
  );

const signIn = (id: string | null, metadata?: Record<string, unknown>) => {
  mockUserId = id;
  mockGetSession.mockResolvedValue({
    data: { session: id ? { user: { id, user_metadata: metadata ?? {} } } : null },
    error: null,
  });
};
const raw = (key: string) => AsyncStorage.getItem(key);
const rawJson = async (key: string) => JSON.parse((await raw(key)) as string);

let warn: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  mockUpdateUser.mockReset().mockResolvedValue({ data: {}, error: null });
  mockGetSession.mockReset();
  signIn(null);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const m of Object.keys(realImpl) as Method[]) storage[m].mockImplementation(realImpl[m]);
  jest.restoreAllMocks();
});

describe('the options', () => {
  it('are Women\'s, Men\'s and Both, in that order', () => {
    expect(WARDROBE_FOR_OPTIONS).toEqual([
      { value: 'women', label: "Women's" },
      { value: 'men', label: "Men's" },
      { value: 'both', label: 'Both' },
    ]);
  });

  it('are the only answers: anything else is not one', () => {
    for (const ok of ['women', 'men', 'both']) expect(isWardrobeFor(ok)).toBe(true);
    for (const bad of ['unisex', 'Women', 'MEN', ' men', 'women ', '', null, undefined, 1, true, {}, ['women']]) {
      expect(isWardrobeFor(bad)).toBe(false);
    }
  });

  it('have labels, and an empty one for no answer', () => {
    expect(wardrobeForLabel('women')).toBe("Women's");
    expect(wardrobeForLabel('men')).toBe("Men's");
    expect(wardrobeForLabel('both')).toBe('Both');
    expect(wardrobeForLabel(null)).toBe('');
    expect(wardrobeForLabel(undefined)).toBe('');
  });
});

describe('getWardrobeFor', () => {
  it('is null for a guest who has not answered, and does not look at an account', async () => {
    expect(await getWardrobeFor()).toBeNull();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('reads the key of the guest, or of the signed-in account', async () => {
    await AsyncStorage.setItem(`${ANSWER}:guest`, 'women');
    expect(await getWardrobeFor()).toBe('women');

    await AsyncStorage.setItem(`${ANSWER}:u:u1`, 'men');
    signIn('u1');
    expect(await getWardrobeFor()).toBe('men');
  });

  it("keeps a guest's answer apart from an account's, and one account's from another's", async () => {
    await AsyncStorage.setItem(`${ANSWER}:guest`, 'women');
    await AsyncStorage.setItem(`${ANSWER}:u:a`, 'men');
    await AsyncStorage.setItem(`${ANSWER}:u:b`, 'both');

    signIn(null);
    expect(await getWardrobeFor()).toBe('women');
    signIn('a');
    expect(await getWardrobeFor()).toBe('men');
    signIn('b');
    expect(await getWardrobeFor()).toBe('both');
    signIn('c');
    expect(await getWardrobeFor()).toBeNull();
  });

  it('accepts both as an answer', async () => {
    await AsyncStorage.setItem(`${ANSWER}:guest`, 'both');
    expect(await getWardrobeFor()).toBe('both');
  });

  it.each(['unisex', 'Women', 'MEN', 'women ', 'true', 'null', '{"a":1}'])(
    'ignores a stored value that is not an answer (%j)',
    async bad => {
      await AsyncStorage.setItem(`${ANSWER}:guest`, bad);
      expect(await getWardrobeFor()).toBeNull();
    },
  );

  it('ignores a stored value that is not an answer for an account too, and asks the profile instead', async () => {
    await AsyncStorage.setItem(`${ANSWER}:u:u1`, 'unisex');
    signIn('u1', { wardrobe_for: 'men' });
    expect(await getWardrobeFor()).toBe('men');
    // and the bad copy is replaced by the good one
    expect(await raw(`${ANSWER}:u:u1`)).toBe('men');
  });

  describe("when the device has no answer yet, but the account's profile does", () => {
    it('uses the profile\'s answer and keeps a copy on the device', async () => {
      signIn('u1', { wardrobe_for: 'women' });
      expect(await getWardrobeFor()).toBe('women');
      expect(await raw(`${ANSWER}:u:u1`)).toBe('women');
    });

    it('does not ask the profile again once it has been copied', async () => {
      signIn('u1', { wardrobe_for: 'both' });
      expect(await getWardrobeFor()).toBe('both');
      expect(await getWardrobeFor()).toBe('both');
      expect(await getWardrobeFor()).toBe('both');
      expect(mockGetSession).toHaveBeenCalledTimes(1);
    });

    it('does not copy a profile answer to the guest key or to another account', async () => {
      signIn('u1', { wardrobe_for: 'men' });
      await getWardrobeFor();
      expect(await raw(`${ANSWER}:guest`)).toBeNull();
      expect(await raw(`${ANSWER}:u:u2`)).toBeNull();
    });

    it('prefers what is on the device to what the profile says', async () => {
      await AsyncStorage.setItem(`${ANSWER}:u:u1`, 'women');
      signIn('u1', { wardrobe_for: 'men' });
      expect(await getWardrobeFor()).toBe('women');
      expect(mockGetSession).not.toHaveBeenCalled();
    });

    it.each([['unisex'], ['Women'], [''], [42], [null], [undefined], [{}], [['women']], [true]])(
      'ignores a profile value that is not an answer (%j), and saves nothing',
      async bad => {
        signIn('u1', { wardrobe_for: bad });
        expect(await getWardrobeFor()).toBeNull();
        expect(await raw(`${ANSWER}:u:u1`)).toBeNull();
      },
    );

    it('is null when the profile has no wardrobe_for at all, or no metadata, or no session', async () => {
      signIn('u1', { name: 'Ada' });
      expect(await getWardrobeFor()).toBeNull();

      mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
      expect(await getWardrobeFor()).toBeNull();

      mockGetSession.mockResolvedValue({ data: { session: null } });
      expect(await getWardrobeFor()).toBeNull();

      mockGetSession.mockResolvedValue({ data: null });
      expect(await getWardrobeFor()).toBeNull();
    });
  });

  describe('when something fails', () => {
    it('is null if the account cannot be identified', async () => {
      mockUserId = 'THROW';
      expect(await getWardrobeFor()).toBeNull();
      expect(warn).toHaveBeenCalled();
    });

    it('is null if the device cannot be read', async () => {
      await AsyncStorage.setItem(`${ANSWER}:guest`, 'men');
      failOn('getItem');
      await expect(getWardrobeFor()).resolves.toBeNull();
      expect(warn).toHaveBeenCalled();
    });

    it('is null if the profile cannot be read', async () => {
      signIn('u1');
      mockGetSession.mockRejectedValue(new Error('offline'));
      await expect(getWardrobeFor()).resolves.toBeNull();
      expect(warn).toHaveBeenCalled();
    });
  });
});

describe('setWardrobeFor', () => {
  it('saves a guest\'s answer on the device under the guest key and nowhere else', async () => {
    await setWardrobeFor('men');
    expect(await raw(`${ANSWER}:guest`)).toBe('men');
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(await getWardrobeFor()).toBe('men');
  });

  it('saves a signed-in answer under that account and copies it to the profile', async () => {
    signIn('u1');
    await setWardrobeFor('women');
    expect(await raw(`${ANSWER}:u:u1`)).toBe('women');
    expect(await raw(`${ANSWER}:guest`)).toBeNull();
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { wardrobe_for: 'women' } });
  });

  it.each(['women', 'men', 'both'] as const)('accepts %s', async value => {
    signIn('u1');
    await setWardrobeFor(value);
    expect(await getWardrobeFor()).toBe(value);
    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { wardrobe_for: value } });
  });

  it('changing the answer replaces the earlier one on the device and in the profile', async () => {
    signIn('u1');
    await setWardrobeFor('women');
    await setWardrobeFor('both');
    expect(await getWardrobeFor()).toBe('both');
    expect(mockUpdateUser).toHaveBeenNthCalledWith(1, { data: { wardrobe_for: 'women' } });
    expect(mockUpdateUser).toHaveBeenNthCalledWith(2, { data: { wardrobe_for: 'both' } });
  });

  it("one account's answer does not touch another's or the guest's", async () => {
    signIn('a');
    await setWardrobeFor('men');
    signIn('b');
    await setWardrobeFor('women');
    signIn(null);
    expect(await getWardrobeFor()).toBeNull();
    signIn('a');
    expect(await getWardrobeFor()).toBe('men');
    signIn('b');
    expect(await getWardrobeFor()).toBe('women');
  });

  it('refuses anything that is not an answer, and saves nothing', async () => {
    signIn('u1');
    for (const bad of ['unisex', 'Women', '', undefined, 1, {}]) {
      await expect(setWardrobeFor(bad as any)).rejects.toThrow('wardrobe_for must be women, men or both');
    }
    expect(await raw(`${ANSWER}:u:u1`)).toBeNull();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  describe('setWardrobeFor(null)', () => {
    it('clears the answer on the device', async () => {
      await setWardrobeFor('men');
      await setWardrobeFor(null);
      expect(await raw(`${ANSWER}:guest`)).toBeNull();
      expect(await getWardrobeFor()).toBeNull();
    });

    it('also clears the copy on the account', async () => {
      signIn('u1');
      await setWardrobeFor('women');
      mockUpdateUser.mockClear();
      await setWardrobeFor(null);
      expect(await raw(`${ANSWER}:u:u1`)).toBeNull();
      expect(mockUpdateUser).toHaveBeenCalledTimes(1);
      expect(mockUpdateUser).toHaveBeenCalledWith({ data: { wardrobe_for: null } });
    });

    it('leaves the other people\'s answers alone', async () => {
      await AsyncStorage.setItem(`${ANSWER}:guest`, 'women');
      await AsyncStorage.setItem(`${ANSWER}:u:b`, 'men');
      signIn('a');
      await setWardrobeFor(null);
      expect(await raw(`${ANSWER}:guest`)).toBe('women');
      expect(await raw(`${ANSWER}:u:b`)).toBe('men');
    });

    it('does not touch the account for a guest', async () => {
      await setWardrobeFor(null);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe('when something fails', () => {
    it('a failing copy to the account does not make saving fail, and the device keeps the answer', async () => {
      signIn('u1');
      mockUpdateUser.mockRejectedValue(new Error('offline'));
      await expect(setWardrobeFor('men')).resolves.toBeUndefined();
      expect(await raw(`${ANSWER}:u:u1`)).toBe('men');
      expect(await getWardrobeFor()).toBe('men');
      expect(warn).toHaveBeenCalled();
    });

    it('an account that answers with an error (not a throw) does not make saving fail either', async () => {
      signIn('u1');
      mockUpdateUser.mockResolvedValue({ data: null, error: { message: 'rate limited' } });
      await expect(setWardrobeFor('both')).resolves.toBeUndefined();
      expect(await getWardrobeFor()).toBe('both');
    });

    it('a failing device write throws, and the account is not told', async () => {
      signIn('u1');
      failOn('setItem', ANSWER);
      await expect(setWardrobeFor('men')).rejects.toThrow('setItem failed');
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('a failing device write keeps the earlier answer', async () => {
      await setWardrobeFor('women');
      failOn('setItem', ANSWER);
      await expect(setWardrobeFor('men')).rejects.toThrow();
      expect(await getWardrobeFor()).toBe('women');
    });

    it('a failing clear throws too, and the account keeps its copy', async () => {
      signIn('u1');
      await setWardrobeFor('men');
      mockUpdateUser.mockClear();
      failOn('removeItem');
      await expect(setWardrobeFor(null)).rejects.toThrow('removeItem failed');
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(await getWardrobeFor()).toBe('men');
    });
  });
});

describe('audienceSignal', () => {
  it('is nothing for an item that says nothing', () => {
    expect(audienceSignal({})).toEqual({ women: 0, men: 0 });
    expect(audienceSignal({ category: 'tops', subcategory: 'T-shirt', name: 'Plain tee' })).toEqual({ women: 0, men: 0 });
    expect(audienceSignal({ category: undefined, subcategory: undefined, name: undefined, aiGender: undefined })).toEqual({
      women: 0,
      men: 0,
    });
  });

  it('gives a new object every time', () => {
    const a = audienceSignal({});
    a.women = 99;
    expect(audienceSignal({})).toEqual({ women: 0, men: 0 });
  });

  describe('category', () => {
    it('counts for women when it is dresses, and for nothing else', () => {
      expect(audienceSignal({ category: 'dresses' })).toEqual({ women: 2, men: 0 });
      for (const category of ['tops', 'bottoms', 'outerwear', 'shoes', 'bags', 'jewelry', 'hats', 'activewear', 'swimwear', 'accessories']) {
        expect(audienceSignal({ category })).toEqual({ women: 0, men: 0 });
      }
    });
  });

  describe('type', () => {
    it.each([
      ['Skirt', 2],
      ['Heels', 2],
      ['Pumps', 2],
      ['Blouse', 2],
      ['Crop top', 2],
      ['Bikini', 2],
      ['Sports bra', 2],
      ['Romper', 2],
      ['Clutch', 2],
      ['Cover-up', 2],
      ['Evening gown', 2],
      ['Cocktail dress', 2],
      ['Wrap dress', 2],
      ['Casual dress', 2],
      ['Mini dress', 2],
      ['Midi dress', 2],
      ['Maxi dress', 2],
      ['Flats', 1],
      ['Wedges', 1],
      ['Mules', 1],
      ['Handbag', 1],
      ['Earrings', 1],
      ['Necklace', 1],
      ['Anklet', 1],
      ['Hair accessory', 1],
      ['Capris', 1],
      ['Wide-leg pants', 1],
      ['One-piece', 1],
      ['Jumpsuit', 1],
      ['Bodysuit', 1],
      ['Tunic', 1],
    ])('%s points %i toward women', (type, points) => {
      expect(audienceSignal({ subcategory: type })).toEqual({ women: points, men: 0 });
    });

    it.each([
      ['Tie', 2],
      ['Swim trunks', 2],
    ])('%s points %i toward men', (type, points) => {
      expect(audienceSignal({ subcategory: type })).toEqual({ women: 0, men: points });
    });

    it('is read without regard to case or surrounding spaces', () => {
      expect(audienceSignal({ subcategory: '  HEELS ' })).toEqual({ women: 2, men: 0 });
      expect(audienceSignal({ subcategory: 'sWiM tRuNkS' })).toEqual({ women: 0, men: 2 });
      expect(audienceSignal({ subcategory: '\tskirt\n' })).toEqual({ women: 2, men: 0 });
    });

    it.each(['Sneakers', 'T-shirt', 'Jeans', 'Other', 'Tote', 'Boots', 'Heel', 'Skirts', 'Doctor bag', '', '   '])(
      'adds nothing for a type it does not know (%j)',
      type => {
        expect(audienceSignal({ subcategory: type })).toEqual({ women: 0, men: 0 });
      },
    );

    it('only names types the item form offers (a typo in the table would make a type count for nothing)', () => {
      const offered = new Set(Object.values(CLOTHING_TYPES).flatMap(types => types.map(t => t.label.toLowerCase())));
      const named = [
        'skirt', 'heels', 'pumps', 'blouse', 'crop top', 'evening gown', 'cocktail dress', 'bikini', 'sports bra',
        'bodysuit', 'tunic', 'wrap dress', 'casual dress', 'mini dress', 'midi dress', 'maxi dress', 'jumpsuit',
        'romper', 'clutch', 'earrings', 'necklace', 'anklet', 'hair accessory', 'flats', 'wedges', 'mules',
        'handbag', 'capris', 'wide-leg pants', 'one-piece', 'cover-up', 'tie', 'swim trunks',
      ];
      for (const type of named) expect(offered.has(type)).toBe(true);
    });

    it('points one way only for every type on the menu, and never more than a dress does', () => {
      for (const [category, types] of Object.entries(CLOTHING_TYPES)) {
        for (const { label } of types) {
          const s = audienceSignal({ category, subcategory: label });
          expect(Math.min(s.women, s.men)).toBe(0);
          expect(s.women).toBeLessThanOrEqual(4); // a dress category (2) plus a dress type (2)
          expect(s.men).toBeLessThanOrEqual(2);
        }
      }
    });

    // `WOMEN_TYPES['constructor']` is Object, which is not nullish, so it is added as a string.
    it('adds nothing for a type that is named like something every object has', () => {
      for (const subcategory of ['constructor', '__proto__']) {
        expect(audienceSignal({ subcategory })).toEqual({ women: 0, men: 0 });
      }
    });
  });

  describe('words in the name', () => {
    it.each([
      "Women's wool coat",
      'womens sweater',
      "WOMEN'S",
      "women's",
      "Woman's watch",
      'womans watch',
      'Ladies tee',
      "Lady's gloves",
      'Female cut jeans',
      'Wool coat (womens)',
      "Women's-fit denim",
      'Coat, women\'s',
    ])('%j points 3 toward women', name => {
      expect(audienceSignal({ name })).toEqual({ women: 3, men: 0 });
    });

    it.each([
      "Men's wool coat",
      'mens sweater',
      "MEN'S",
      "men's",
      "Man's watch",
      'mans watch',
      'Gents tee',
      'Male cut jeans',
      'Wool coat (mens)',
      "Men's-fit denim",
    ])('%j points 3 toward men', name => {
      expect(audienceSignal({ name })).toEqual({ women: 0, men: 3 });
    });

    it("never counts women's as men's, or female as male", () => {
      for (const name of ["Women's", 'Womens', "Woman's", 'Womans', 'Female', "Nike Women's Air Max", 'Ladies female']) {
        expect(audienceSignal({ name }).men).toBe(0);
      }
    });

    it.each([
      "Men's and women's tee",
      "Women's / Men's tee",
      'mens womens tee',
      "Unisex: men's & women's",
      'Male and female cut',
      "Ladies' and gents' tee",
    ])('a name with both genders (%j) adds nothing', name => {
      expect(audienceSignal({ name })).toEqual({ women: 0, men: 0 });
    });

    it('a name with both genders still lets the category, type and photo count', () => {
      expect(audienceSignal({ name: "Men's and women's", category: 'dresses', subcategory: 'Skirt', aiGender: 'women' })).toEqual({
        women: 6,
        men: 0,
      });
    });

    it.each([
      'Menswear jacket',
      'Womenswear jacket',
      "Salesmen's bag",
      "Gentlemen's club tee",
      "Fireman's coat",
      'Mensa tee',
      'Mental health tee',
      'Amen tee',
      'Hermen',
      'Plain wool coat',
      '',
    ])('%j adds nothing (the words must stand alone, with the s)', name => {
      expect(audienceSignal({ name })).toEqual({ women: 0, men: 0 });
    });

    it('is found anywhere in the name', () => {
      expect(audienceSignal({ name: "Navy Nike Dri-FIT women's running tee, size M" }).women).toBe(3);
      expect(audienceSignal({ name: "Vintage Levi's 501 men's jeans" }).men).toBe(3);
    });

    it('does not count a word twice', () => {
      expect(audienceSignal({ name: "Women's women's WOMEN'S" }).women).toBe(3);
    });

    // Retailers' titles (and an iPhone's keyboard, which turns ' into ’) write it with a curly apostrophe.
    it("reads a curly apostrophe like a straight one (Women’s, Men’s)", () => {
      expect(audienceSignal({ name: 'Women’s wool coat' })).toEqual({ women: 3, men: 0 });
      expect(audienceSignal({ name: 'Men’s wool coat' })).toEqual({ women: 0, men: 3 });
    });
  });

  describe('what the photo analysis said', () => {
    it('counts 2 for women or men, and nothing for unisex or anything else', () => {
      expect(audienceSignal({ aiGender: 'women' })).toEqual({ women: 2, men: 0 });
      expect(audienceSignal({ aiGender: 'men' })).toEqual({ women: 0, men: 2 });
      for (const aiGender of ['unisex', 'Women', 'male', 'female', '', undefined]) {
        expect(audienceSignal({ aiGender })).toEqual({ women: 0, men: 0 });
      }
    });
  });

  describe('together', () => {
    it('adds category, type, name and photo', () => {
      expect(
        audienceSignal({ category: 'dresses', subcategory: 'Cocktail dress', name: "Women's satin dress", aiGender: 'women' }),
      ).toEqual({ women: 2 + 2 + 3 + 2, men: 0 });
    });

    it('can point both ways when the clues disagree', () => {
      expect(audienceSignal({ category: 'dresses', subcategory: 'Tie', aiGender: 'men' })).toEqual({ women: 2, men: 4 });
      expect(audienceSignal({ subcategory: 'Skirt', name: "Men's kilt", aiGender: 'men' })).toEqual({ women: 2, men: 5 });
    });
  });
});

describe('suggestAudience', () => {
  it('needs a lead of 3', () => {
    expect(SUGGESTION_LEAD).toBe(3);
  });

  it.each([
    // women, men, suggestion
    [0, 0, null],
    [1, 0, null],
    [2, 0, null], // lead 2: not yet
    [3, 0, 'women'], // lead 3: enough
    [4, 0, 'women'],
    [3, 1, null], // lead 2 with one point against
    [4, 1, 'women'], // lead 3, one point against is tolerated
    [5, 1, 'women'],
    [5, 2, null], // lead 3 but two points against
    [6, 2, null],
    [100, 1, 'women'],
    [100, 2, null], // however far ahead, two points the other way is a mixed wardrobe
    [100, 100, null],
    [0, 1, null],
    [0, 2, null],
    [0, 3, 'men'],
    [0, 4, 'men'],
    [1, 3, null],
    [1, 4, 'men'],
    [2, 5, null],
    [2, 100, null],
    [1, 100, 'men'],
    [5, 5, null],
    [2, 4, null],
  ])('women %i, men %i: %s', (women, men, expected) => {
    expect(suggestAudience({ women, men })).toBe(expected);
  });
});

describe('recordAudienceSignal', () => {
  it('stores the points under the guest key and returns the running total', async () => {
    const total = await recordAudienceSignal({ category: 'dresses' });
    expect(total).toEqual({ women: 2, men: 0 });
    expect(await rawJson(`${SIGNALS}:guest`)).toEqual({ women: 2, men: 0 });
  });

  it('adds up across calls', async () => {
    await recordAudienceSignal({ category: 'dresses' });
    await recordAudienceSignal({ subcategory: 'Tie' });
    const total = await recordAudienceSignal({ name: "Women's coat", aiGender: 'women' });
    expect(total).toEqual({ women: 2 + 3 + 2, men: 2 });
    expect(await rawJson(`${SIGNALS}:guest`)).toEqual({ women: 7, men: 2 });
  });

  it('keeps the totals of a guest and of each account apart', async () => {
    await recordAudienceSignal({ category: 'dresses' });
    signIn('a');
    await recordAudienceSignal({ subcategory: 'Tie' });
    await recordAudienceSignal({ subcategory: 'Tie' });
    signIn('b');
    await recordAudienceSignal({ name: "Women's coat" });

    expect(await rawJson(`${SIGNALS}:guest`)).toEqual({ women: 2, men: 0 });
    expect(await rawJson(`${SIGNALS}:u:a`)).toEqual({ women: 0, men: 4 });
    expect(await rawJson(`${SIGNALS}:u:b`)).toEqual({ women: 3, men: 0 });

    signIn(null);
    expect(await recordAudienceSignal({ category: 'dresses' })).toEqual({ women: 4, men: 0 });
  });

  it('an item that says nothing leaves the total as it was', async () => {
    await recordAudienceSignal({ category: 'dresses' });
    expect(await recordAudienceSignal({ category: 'tops', subcategory: 'Sneakers', name: 'Plain' })).toEqual({ women: 2, men: 0 });
  });

  it.each([
    ['not JSON', '{not json'],
    ['a number', '5'],
    ['JSON null', 'null'],
    ['an array', '[1,2]'],
    ['a missing field', '{"women":4}'],
    ['a field that is not a number', '{"women":"4","men":0}'],
    ['a null field', '{"women":null,"men":2}'],
    ['an empty object', '{}'],
  ])('starts again from zero when the stored total is %s', async (_label, stored) => {
    await AsyncStorage.setItem(`${SIGNALS}:guest`, stored);
    expect(await recordAudienceSignal({ subcategory: 'Skirt' })).toEqual({ women: 2, men: 0 });
    expect(await rawJson(`${SIGNALS}:guest`)).toEqual({ women: 2, men: 0 });
  });

  it('is null, and warns, when the total cannot be saved - it never throws', async () => {
    failOn('setItem', SIGNALS);
    await expect(recordAudienceSignal({ category: 'dresses' })).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('is null when the account cannot be identified', async () => {
    mockUserId = 'THROW';
    await expect(recordAudienceSignal({ category: 'dresses' })).resolves.toBeNull();
  });

  it('starts from zero when the stored total cannot be read, rather than failing', async () => {
    await AsyncStorage.setItem(`${SIGNALS}:guest`, JSON.stringify({ women: 10, men: 0 }));
    failOn('getItem', SIGNALS);
    expect(await recordAudienceSignal({ subcategory: 'Skirt' })).toEqual({ women: 2, men: 0 });
  });

  // The total is read, added to and written back, so two additions at the same moment lose one of them.
  it('does not lose an item when two are added at the same moment', async () => {
    await Promise.all([recordAudienceSignal({ category: 'dresses' }), recordAudienceSignal({ category: 'dresses' })]);
    expect(await rawJson(`${SIGNALS}:guest`)).toEqual({ women: 4, men: 0 });
  });
});

describe('getAudienceSuggestion', () => {
  const dresses = (n: number) => Array.from({ length: n }, () => ({ category: 'dresses' as const }));

  it('is null with nothing stored and no items, and stores nothing', async () => {
    expect(await getAudienceSuggestion()).toBeNull();
    expect(await getAudienceSuggestion([])).toBeNull();
    expect(await raw(`${SIGNALS}:guest`)).toBeNull();
  });

  it('suggests from the running total', async () => {
    await AsyncStorage.setItem(`${SIGNALS}:guest`, JSON.stringify({ women: 3, men: 0 }));
    expect(await getAudienceSuggestion()).toBe('women');

    await AsyncStorage.setItem(`${SIGNALS}:guest`, JSON.stringify({ women: 0, men: 3 }));
    expect(await getAudienceSuggestion()).toBe('men');

    await AsyncStorage.setItem(`${SIGNALS}:guest`, JSON.stringify({ women: 2, men: 0 }));
    expect(await getAudienceSuggestion()).toBeNull();

    await AsyncStorage.setItem(`${SIGNALS}:guest`, JSON.stringify({ women: 8, men: 4 }));
    expect(await getAudienceSuggestion()).toBeNull();
  });

  it('follows what recordAudienceSignal has added', async () => {
    await recordAudienceSignal({ category: 'dresses' });
    expect(await getAudienceSuggestion()).toBeNull();
    await recordAudienceSignal({ category: 'dresses' });
    expect(await getAudienceSuggestion()).toBe('women');
  });

  it('uses the stored total and ignores the items when there is one', async () => {
    await AsyncStorage.setItem(`${SIGNALS}:guest`, JSON.stringify({ women: 0, men: 0 }));
    expect(await getAudienceSuggestion(dresses(5))).toBeNull();

    await AsyncStorage.setItem(`${SIGNALS}:guest`, JSON.stringify({ women: 0, men: 6 }));
    expect(await getAudienceSuggestion(dresses(5))).toBe('men');
  });

  describe('for a wardrobe that was built before the app kept a total', () => {
    it('counts the items it is given, and keeps the count', async () => {
      expect(await getAudienceSuggestion(dresses(2))).toBe('women');
      expect(await rawJson(`${SIGNALS}:guest`)).toEqual({ women: 4, men: 0 });
    });

    it('counts them exactly once: later calls use the stored total, not the items again', async () => {
      expect(await getAudienceSuggestion(dresses(2))).toBe('women');
      // The same items again, and different ones: neither changes the total.
      expect(await getAudienceSuggestion(dresses(2))).toBe('women');
      expect(await getAudienceSuggestion([{ subcategory: 'Tie' }, { subcategory: 'Tie' }, { subcategory: 'Tie' }])).toBe('women');
      expect(await rawJson(`${SIGNALS}:guest`)).toEqual({ women: 4, men: 0 });
    });

    it('keeps the count even when it suggests nothing, so those items are not counted again either', async () => {
      expect(await getAudienceSuggestion(dresses(1))).toBeNull();
      expect(await rawJson(`${SIGNALS}:guest`)).toEqual({ women: 2, men: 0 });
      expect(await getAudienceSuggestion(dresses(1))).toBeNull();
      expect(await rawJson(`${SIGNALS}:guest`)).toEqual({ women: 2, men: 0 });
    });

    it('is null for a mixed wardrobe', async () => {
      const items = [...dresses(3), { subcategory: 'Tie' }, { subcategory: 'Swim trunks' }];
      expect(await getAudienceSuggestion(items)).toBeNull();
      expect(await rawJson(`${SIGNALS}:guest`)).toEqual({ women: 6, men: 4 });
    });

    it('works from names, types and the photo, as an added item does', async () => {
      const items = [{ name: "Men's wool coat" }];
      expect(await getAudienceSuggestion(items)).toBe('men');
    });

    it('counts into the signed-in account\'s total, not the guest\'s', async () => {
      signIn('u1');
      expect(await getAudienceSuggestion(dresses(2))).toBe('women');
      expect(await raw(`${SIGNALS}:u:u1`)).not.toBeNull();
      expect(await raw(`${SIGNALS}:guest`)).toBeNull();
    });

    it('a different account with no total of its own counts the items it is given, apart from the first', async () => {
      signIn('a');
      await getAudienceSuggestion(dresses(2));
      signIn('b');
      expect(await getAudienceSuggestion([])).toBeNull();
      expect(await getAudienceSuggestion([{ subcategory: 'Tie' }, { subcategory: 'Tie' }])).toBe('men');
      expect(await rawJson(`${SIGNALS}:u:a`)).toEqual({ women: 4, men: 0 });
      expect(await rawJson(`${SIGNALS}:u:b`)).toEqual({ women: 0, men: 4 });
    });

    it('replaces a corrupt stored total with the items\' count', async () => {
      await AsyncStorage.setItem(`${SIGNALS}:guest`, '{oops');
      expect(await getAudienceSuggestion(dresses(2))).toBe('women');
      expect(await rawJson(`${SIGNALS}:guest`)).toEqual({ women: 4, men: 0 });
    });
  });

  it('ignores a corrupt stored total when there are no items', async () => {
    await AsyncStorage.setItem(`${SIGNALS}:guest`, '{oops');
    expect(await getAudienceSuggestion()).toBeNull();
    await AsyncStorage.setItem(`${SIGNALS}:guest`, '{"women":"x","men":1}');
    expect(await getAudienceSuggestion()).toBeNull();
  });

  it('is null, and warns, when storage fails - it never throws', async () => {
    failOn('setItem', SIGNALS);
    await expect(getAudienceSuggestion(dresses(2))).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('is null when the account cannot be identified', async () => {
    mockUserId = 'THROW';
    await expect(getAudienceSuggestion(dresses(2))).resolves.toBeNull();
  });

  it('does not read a guest\'s total for a signed-in account', async () => {
    await AsyncStorage.setItem(`${SIGNALS}:guest`, JSON.stringify({ women: 9, men: 0 }));
    signIn('u1');
    expect(await getAudienceSuggestion()).toBeNull();
  });
});

describe('wasAsked and markAsked', () => {
  it('is false until marked, then true', async () => {
    expect(await wasAsked()).toBe(false);
    await markAsked();
    expect(await wasAsked()).toBe(true);
    expect(await raw(`${ASKED}:guest`)).toBe('true');
  });

  it('is kept per guest and per account', async () => {
    signIn('a');
    await markAsked();
    expect(await raw(`${ASKED}:u:a`)).toBe('true');
    expect(await wasAsked()).toBe(true);

    signIn('b');
    expect(await wasAsked()).toBe(false);
    signIn(null);
    expect(await wasAsked()).toBe(false);

    await markAsked();
    signIn('b');
    expect(await wasAsked()).toBe(false);
    signIn('a');
    expect(await wasAsked()).toBe(true);
  });

  it('is not the same thing as having an answer', async () => {
    await markAsked();
    expect(await getWardrobeFor()).toBeNull();
    await setWardrobeFor('men');
    signIn('u1');
    expect(await wasAsked()).toBe(false);
  });

  it.each(['false', '1', 'yes', 'TRUE', ''])('only "true" counts (%j is not asked)', async value => {
    await AsyncStorage.setItem(`${ASKED}:guest`, value);
    expect(await wasAsked()).toBe(false);
  });

  it('is false when storage cannot be read, and never throws', async () => {
    await markAsked();
    failOn('getItem');
    await expect(wasAsked()).resolves.toBe(false);
  });

  it('is false when the account cannot be identified', async () => {
    mockUserId = 'THROW';
    await expect(wasAsked()).resolves.toBe(false);
  });

  it('markAsked never throws when storage cannot be written, and warns', async () => {
    failOn('setItem');
    await expect(markAsked()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('markAsked never throws when the account cannot be identified', async () => {
    mockUserId = 'THROW';
    await expect(markAsked()).resolves.toBeUndefined();
  });
});
