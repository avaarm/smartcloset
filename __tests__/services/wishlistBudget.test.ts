// @ts-ignore — resolved by react-native-dotenv babel plugin
import { SUPABASE_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  budgetStatus,
  getWishlistBudget,
  isValidBudget,
  parseBudgetInput,
  setWishlistBudget,
  wishlistItemPrice,
  wishlistTotals,
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

describe('wishlist prices and totals', () => {
  it('an item costs its listed price, else its retail price, else nothing', () => {
    expect(wishlistItemPrice({ cost: 862 })).toBe(862);
    expect(wishlistItemPrice({ cost: 80, retailCost: 120 })).toBe(80);
    expect(wishlistItemPrice({ retailCost: 120 })).toBe(120);
    expect(wishlistItemPrice({ cost: 0, retailCost: 120 })).toBe(120);
    expect(wishlistItemPrice({})).toBe(0);
    expect(wishlistItemPrice({ cost: 0, retailCost: 0 })).toBe(0);
    expect(wishlistItemPrice({ cost: NaN, retailCost: -3 })).toBe(0);
  });

  it('sums the prices and counts the items with none, which add nothing', () => {
    expect(wishlistTotals([])).toEqual({ total: 0, unpriced: 0 });
    expect(wishlistTotals([{ cost: 862 }, {}, { retailCost: 100 }, { cost: 0 }])).toEqual({ total: 962, unpriced: 2 });
  });

  it('adds cents without floating-point drift', () => {
    expect(wishlistTotals([{ cost: 0.1 }, { cost: 0.2 }, { cost: 19.99 }]).total).toBe(20.29);
  });
});

describe('budgetStatus', () => {
  it('is under budget with room left, and how much of the bar is used', () => {
    expect(budgetStatus(862, 1000)).toEqual({ kind: 'under', amount: 138, used: 0.862 });
    expect(budgetStatus(0, 1000)).toEqual({ kind: 'under', amount: 1000, used: 0 });
  });

  it('is over budget by the excess, with the bar capped at full', () => {
    expect(budgetStatus(1500, 1000)).toEqual({ kind: 'over', amount: 500, used: 1 });
  });

  it('is on budget when the two match', () => {
    expect(budgetStatus(1000, 1000)).toEqual({ kind: 'on', amount: 0, used: 1 });
  });

  it('judges in whole dollars, as the numbers are shown, so the words never contradict them', () => {
    // Both read "$862" on screen.
    expect(budgetStatus(862.2, 862.4).kind).toBe('on');
    expect(budgetStatus(862.4, 862.2).kind).toBe('on');
    expect(budgetStatus(862.6, 862).kind).toBe('over');
  });
});
