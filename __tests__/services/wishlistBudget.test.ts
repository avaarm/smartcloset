// @ts-ignore — resolved by react-native-dotenv babel plugin
import { SUPABASE_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as wishlistBudget from '../../src/services/wishlistBudget';
import {
  getWishlistBudget,
  isValidBudget,
  parseBudgetInput,
  setWishlistBudget,
  wishlistNewPrice,
  wishlistTotals,
  wishlistUsedPrice,
} from '../../src/services/wishlistBudget';

// Where auth-js keeps the saved login, which authUser reads when the network is down.
const STORED_SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

let mockSession: { user: { id: string } } | null = null;
let mockSessionError: { name: string } | null = null;
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: mockSession }, error: mockSessionError }) },
  },
}));

const signInAs = (id: string | null) => {
  mockSession = id ? { user: { id } } : null;
};

beforeEach(async () => {
  await AsyncStorage.clear();
  signInAs(null);
  mockSessionError = null;
  jest.restoreAllMocks();
});

describe('the saved wishlist budget', () => {
  it('is null until one is set', async () => {
    expect(await getWishlistBudget()).toBeNull();
  });

  it("is kept for a guest under the guest's own key", async () => {
    expect(await setWishlistBudget(1200)).toBe(1200);
    expect(await getWishlistBudget()).toBe(1200);
    expect(await AsyncStorage.getAllKeys()).toEqual(['@smartcloset_wishlist_budget:guest']);
  });

  it('is kept for a signed-in user under their account id', async () => {
    signInAs('user-a');
    await setWishlistBudget(500);
    expect(await getWishlistBudget()).toBe(500);
    expect(await AsyncStorage.getAllKeys()).toEqual(['@smartcloset_wishlist_budget:u:user-a']);
  });

  it("never shows one account's budget under another account or a guest, and gives it back to its owner", async () => {
    signInAs('user-a');
    await setWishlistBudget(500);

    signInAs('user-b');
    expect(await getWishlistBudget()).toBeNull();
    await setWishlistBudget(300);

    signInAs(null);
    expect(await getWishlistBudget()).toBeNull();
    await setWishlistBudget(100);

    signInAs('user-a');
    expect(await getWishlistBudget()).toBe(500);
    signInAs('user-b');
    expect(await getWishlistBudget()).toBe(300);
    signInAs(null);
    expect(await getWishlistBudget()).toBe(100);
  });

  it('stays under the signed-in account when the saved login has expired and the phone is offline', async () => {
    // authUser falls back to the id in the stored session instead of treating the user as a guest.
    await AsyncStorage.setItem(STORED_SESSION_KEY, JSON.stringify({ user: { id: 'user-a' } }));
    signInAs('user-a');
    await setWishlistBudget(500);

    signInAs(null);
    mockSessionError = { name: 'AuthRetryableFetchError' };
    expect(await getWishlistBudget()).toBe(500);
    await setWishlistBudget(650);
    expect(await AsyncStorage.getItem('@smartcloset_wishlist_budget:u:user-a')).toBe('650');
    expect(await AsyncStorage.getItem('@smartcloset_wishlist_budget:guest')).toBeNull();
  });

  it('clears with null, for the current person only', async () => {
    signInAs('user-a');
    await setWishlistBudget(500);
    signInAs('user-b');
    await setWishlistBudget(300);

    expect(await setWishlistBudget(null)).toBeNull();
    expect(await getWishlistBudget()).toBeNull();
    signInAs('user-a');
    expect(await getWishlistBudget()).toBe(500);
  });

  it('clearing when nothing is saved is fine', async () => {
    await expect(setWishlistBudget(null)).resolves.toBeNull();
  });

  it('keeps cents and drops anything finer', async () => {
    expect(await setWishlistBudget(99.999)).toBe(100);
    expect(await setWishlistBudget(1200.5)).toBe(1200.5);
    expect(await getWishlistBudget()).toBe(1200.5);
    expect(await setWishlistBudget(10.004)).toBe(10);
  });

  it.each([NaN, Infinity, -Infinity, -5, 0, 0.004, '12' as unknown as number, undefined as unknown as number])(
    'rejects %p and leaves the saved budget alone',
    async bad => {
      await setWishlistBudget(250);
      await expect(setWishlistBudget(bad)).rejects.toThrow();
      expect(await getWishlistBudget()).toBe(250);
    },
  );

  it.each(['', 'abc', '-40', '0', 'NaN', 'Infinity', '{"amount":5}'])('reads a damaged stored value (%p) as no budget', async raw => {
    await AsyncStorage.setItem('@smartcloset_wishlist_budget:guest', raw);
    expect(await getWishlistBudget()).toBeNull();
  });

  it('reading never throws if storage fails, so the screen still opens', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await expect(getWishlistBudget()).resolves.toBeNull();
  });

  it('saving does throw if storage fails, so the user is told it was not saved', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
    await expect(setWishlistBudget(100)).rejects.toThrow('disk');
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('disk'));
    await expect(setWishlistBudget(null)).rejects.toThrow('disk');
  });
});

describe('isValidBudget', () => {
  it('accepts only finite numbers above zero', () => {
    expect([1, 0.01, 1200, 1e6].every(isValidBudget)).toBe(true);
    expect([0, -1, NaN, Infinity, '5', null, undefined].some(isValidBudget)).toBe(false);
  });
});

describe('parseBudgetInput', () => {
  it.each([
    ['1200', 1200],
    ['1,200', 1200],
    ['$1,200.50', 1200.5],
    ['  75 ', 75],
    ['1.200,50', 1200.5],
    ['0.5', 0.5],
  ])('reads %p as %p', (raw, amount) => {
    expect(parseBudgetInput(raw)).toEqual({ ok: true, amount });
  });

  it.each([
    ['', 'Enter a dollar amount'],
    ['   ', 'Enter a dollar amount'],
    ['abc', 'Enter a dollar amount'],
    ['1.2.3', 'Enter a dollar amount'],
    ['9'.repeat(400), 'Enter a dollar amount'],
    ['0', 'at least $0.01'],
    ['0.00', 'at least $0.01'],
    ['0.004', 'at least $0.01'],
    ['-50', "can't be negative"],
    ['$-50', "can't be negative"],
    ['-0', "can't be negative"],
  ])('rejects %p with a message', (raw, message) => {
    const parsed = parseBudgetInput(raw);
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.message).toContain(message);
  });
});

// A price as it sits on an item: New is the full retail price (retailCost), Used is the
// resale price (cost). Built in one place so a test never mixes the two up by accident.
const priced = (usedCost?: number, newCost?: number) => ({ cost: usedCost, retailCost: newCost });

describe('wishlistNewPrice and wishlistUsedPrice', () => {
  it('New reads the retail price and Used reads the resale price, each from its own field', () => {
    expect(wishlistNewPrice(priced(3000, 4000))).toBe(4000);
    expect(wishlistUsedPrice(priced(3000, 4000))).toBe(3000);
    expect(wishlistNewPrice(priced(undefined, 120.5))).toBe(120.5);
    expect(wishlistUsedPrice(priced(862.25))).toBe(862.25);
  });

  it('neither one stands in for the other: a missing price is 0, never the other price', () => {
    // The old rule fell back from the listed price to the retail price. That is gone.
    expect(wishlistNewPrice(priced(862))).toBe(0);
    expect(wishlistUsedPrice(priced(undefined, 120))).toBe(0);
    expect(wishlistNewPrice(priced(0, 120))).toBe(120);
    expect(wishlistUsedPrice(priced(80, 0))).toBe(80);
  });

  it.each([
    ['a missing price', undefined],
    ['zero', 0],
    ['a negative price', -3],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['text that looks like a number', '80' as unknown as number],
    ['null', null as unknown as number],
  ])('%s is not a price, so it reads as 0', (_label, bad) => {
    expect(wishlistNewPrice({ retailCost: bad })).toBe(0);
    expect(wishlistUsedPrice({ cost: bad })).toBe(0);
  });

  it('keeps the cents of a real price', () => {
    expect(wishlistNewPrice({ retailCost: 0.01 })).toBe(0.01);
    expect(wishlistUsedPrice({ cost: 19.99 })).toBe(19.99);
  });
});

describe('wishlistTotals', () => {
  const none = { newTotal: 0, usedTotal: 0, withoutNew: 0, withoutUsed: 0, unpriced: 0 };

  it('an empty wishlist totals nothing, and nothing is missing a price', () => {
    expect(wishlistTotals([])).toEqual(none);
  });

  it('adds up the New prices and the Used prices separately', () => {
    const totals = wishlistTotals([priced(3000, 4000), priced(3500, 4000), priced(862, 1200)]);
    expect(totals).toEqual({ newTotal: 9200, usedTotal: 7362, withoutNew: 0, withoutUsed: 0, unpriced: 0 });
  });

  it('an item with only a Used price adds to the Used total, and is missing a New price', () => {
    expect(wishlistTotals([priced(862)])).toEqual({ ...none, usedTotal: 862, withoutNew: 1 });
  });

  it('an item with only a New price adds to the New total, and is missing a Used price', () => {
    expect(wishlistTotals([priced(undefined, 240)])).toEqual({ ...none, newTotal: 240, withoutUsed: 1 });
  });

  it('an item with neither price adds nothing, and is missing both (it is also counted as unpriced)', () => {
    expect(wishlistTotals([{}])).toEqual({ ...none, withoutNew: 1, withoutUsed: 1, unpriced: 1 });
  });

  it('counts each kind of gap on its own across a mixed list', () => {
    const totals = wishlistTotals([
      priced(862), //            used only
      priced(undefined, 240), // new only
      priced(3000, 4000), //     both
      {}, //                     neither
      priced(undefined, undefined), // neither, spelled out
    ]);
    expect(totals).toEqual({
      newTotal: 4240,
      usedTotal: 3862,
      withoutNew: 3, // used-only, neither, neither
      withoutUsed: 3, // new-only, neither, neither
      unpriced: 2,
    });
    // An item missing one price is never "unpriced": that needs both gone.
    expect(totals.unpriced).toBeLessThan(Math.min(totals.withoutNew, totals.withoutUsed));
  });

  it('treats zero, negative, NaN and Infinity prices as missing, not as money', () => {
    const totals = wishlistTotals([
      priced(0, 0),
      priced(-50, -80),
      priced(NaN, NaN),
      priced(Infinity, -Infinity),
      priced(100, 150),
    ]);
    expect(totals).toEqual({ newTotal: 150, usedTotal: 100, withoutNew: 4, withoutUsed: 4, unpriced: 4 });
  });

  it('does not let the Used price leak into the New total or the other way round', () => {
    expect(wishlistTotals([priced(500)]).newTotal).toBe(0);
    expect(wishlistTotals([priced(undefined, 500)]).usedTotal).toBe(0);
  });

  it('adds cents without floating-point drift, in both totals', () => {
    const totals = wishlistTotals([priced(0.1, 0.1), priced(0.2, 0.2), priced(19.99, 19.99)]);
    expect(totals.usedTotal).toBe(20.29);
    expect(totals.newTotal).toBe(20.29);
  });

  it('keeps a long list of small prices exact', () => {
    // Added as plain floats, a hundred 10-cent prices come to 9.99999999999998.
    const dimes = Array.from({ length: 100 }, () => priced(0.1, 0.1));
    expect(wishlistTotals(dimes)).toEqual({ ...none, newTotal: 10, usedTotal: 10 });
  });

  it('does not change the list it was given', () => {
    const list = [priced(3000, 4000), {}];
    const before = JSON.stringify(list);
    wishlistTotals(list);
    expect(JSON.stringify(list)).toBe(before);
  });
});

describe('the budget is not compared with the wishlist', () => {
  // A wishlist is meant to be bigger than the budget, so nothing judges it against the budget.
  it('no longer offers a status for a total against a budget, or a single wishlist price', () => {
    expect(wishlistBudget).not.toHaveProperty('budgetStatus');
    expect(wishlistBudget).not.toHaveProperty('wishlistItemPrice');
  });

  it('the totals carry the two sums and the gaps, with no combined total and nothing about a budget', () => {
    expect(Object.keys(wishlistTotals([priced(10, 20)])).sort()).toEqual(
      ['newTotal', 'unpriced', 'usedTotal', 'withoutNew', 'withoutUsed'].sort(),
    );
  });
});
