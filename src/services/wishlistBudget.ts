/**
 * The wishlist budget, and the wishlist money sums that sit next to it.
 *
 * The budget is one dollar amount per person, kept on this device. The key
 * carries the account id (a guest has a key of its own), so on a shared phone
 * one account's budget can never show up under another. Because the id is part
 * of the key there is nothing for localData's sign-out stash to move: it only
 * handles keys that have no id in them.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClothingItem } from '../types';
import { parseMoney } from '../utils/money';
import { getAuthUserId } from './authUser';

const KEY_PREFIX = '@smartcloset_wishlist_budget';

const budgetKey = (userId: string | null): string =>
  userId ? `${KEY_PREFIX}:u:${userId}` : `${KEY_PREFIX}:guest`;

/** A budget is a real, positive dollar amount; zero, negatives and NaN are not one. */
export const isValidBudget = (amount: unknown): amount is number =>
  typeof amount === 'number' && Number.isFinite(amount) && amount > 0;

/** The saved budget for whoever is signed in (or the guest), or null when none is set. */
export const getWishlistBudget = async (): Promise<number | null> => {
  try {
    const raw = await AsyncStorage.getItem(budgetKey(await getAuthUserId()));
    if (raw == null) return null;
    const amount = Number(raw);
    return isValidBudget(amount) ? amount : null;
  } catch (e) {
    console.warn('[wishlistBudget] could not read the budget:', e);
    return null;
  }
};

/**
 * Saves the budget, or clears it with null, and returns what is now saved. Throws
 * for an amount that is not a positive number, leaving what was saved untouched;
 * a storage error also throws, so the caller can tell the user it did not save.
 */
export const setWishlistBudget = async (amount: number | null): Promise<number | null> => {
  const key = budgetKey(await getAuthUserId());
  if (amount === null) {
    await AsyncStorage.removeItem(key);
    return null;
  }
  if (!isValidBudget(amount)) throw new Error('A budget must be a dollar amount above zero');
  // Cents are kept; anything finer is typing noise. Validate what is actually stored,
  // so 0.004 can't round down to a saved budget of $0.
  const saved = Math.round(amount * 100) / 100;
  if (!isValidBudget(saved)) throw new Error('A budget must be a dollar amount above zero');
  await AsyncStorage.setItem(key, String(saved));
  return saved;
};

export type BudgetInput = { ok: true; amount: number } | { ok: false; message: string };

/**
 * Reads what was typed in the budget field. parseMoney drops a minus sign, so a
 * pasted "-50" would otherwise come back as a valid 50.
 */
export const parseBudgetInput = (raw: string): BudgetInput => {
  if (raw.includes('-')) return { ok: false, message: "A budget can't be negative." };
  const amount = parseMoney(raw);
  if (!Number.isFinite(amount)) return { ok: false, message: 'Enter a dollar amount, like 1,200.' };
  if (Math.round(amount * 100) <= 0) return { ok: false, message: 'Enter an amount of at least $0.01, or clear the budget.' };
  return { ok: true, amount };
};

const isPrice = (n: number | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * What a wishlist item costs: the listed price (cost), else the full retail
 * price, since the form's "New" field is where someone wishing for an item
 * will often type it. 0 when neither is set.
 */
export const wishlistItemPrice = (item: Pick<ClothingItem, 'cost' | 'retailCost'>): number => {
  if (isPrice(item.cost)) return item.cost;
  if (isPrice(item.retailCost)) return item.retailCost;
  return 0;
};

/**
 * Sum of the items' prices, and how many have none (they count as 0). Callers
 * pass wishlist items only; owned items are never part of this number.
 */
export const wishlistTotals = (items: Pick<ClothingItem, 'cost' | 'retailCost'>[]): { total: number; unpriced: number } => {
  let cents = 0;
  let unpriced = 0;
  for (const item of items) {
    const price = wishlistItemPrice(item);
    if (price > 0) cents += Math.round(price * 100);
    else unpriced += 1;
  }
  return { total: cents / 100, unpriced };
};

export interface BudgetStatus {
  kind: 'under' | 'over' | 'on';
  /** Whole dollars left (under) or past the budget (over); 0 when on budget. */
  amount: number;
  /** How much of the budget the total uses, 0 to 1 (capped, so it can fill a bar). */
  used: number;
}

/** Compares the total with a budget (above zero). Judged in whole dollars, as they are shown. */
export const budgetStatus = (total: number, budget: number): BudgetStatus => {
  const diff = Math.round(budget - total);
  return {
    kind: diff > 0 ? 'under' : diff < 0 ? 'over' : 'on',
    amount: Math.abs(diff),
    // A zero or missing budget (never saved, but never divide by it) shows an empty bar.
    used: budget > 0 ? Math.min(Math.max(total / budget, 0), 1) : 0,
  };
};
