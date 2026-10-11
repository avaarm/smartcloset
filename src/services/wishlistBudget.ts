/**
 * The wishlist budget, and the wishlist money sums that sit next to it.
 *
 * A wishlist is never "under budget": it is everything someone would like, so the
 * budget is only a number to keep in view next to the totals, not a limit that the
 * list is judged against.
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

/** What the item costs new (the full retail price), or 0 when that is not set. */
export const wishlistNewPrice = (item: Pick<ClothingItem, 'retailCost'>): number =>
  isPrice(item.retailCost) ? item.retailCost : 0;

/** What the item costs used (resale), or 0 when that is not set. */
export const wishlistUsedPrice = (item: Pick<ClothingItem, 'cost'>): number =>
  isPrice(item.cost) ? item.cost : 0;

export interface WishlistTotals {
  /** Sum of the new prices. */
  newTotal: number;
  /** Sum of the used prices. */
  usedTotal: number;
  /** Items with no new price, and with no used price (each total leaves them out). */
  withoutNew: number;
  withoutUsed: number;
  /** Items with neither price. */
  unpriced: number;
}

/**
 * The two wishlist totals: everything on it bought new, and everything bought used.
 * Callers pass wishlist items only; owned items are never part of these numbers.
 * Summed in cents so a long list of prices with cents adds up exactly.
 */
export const wishlistTotals = (items: Pick<ClothingItem, 'cost' | 'retailCost'>[]): WishlistTotals => {
  let newCents = 0;
  let usedCents = 0;
  let withoutNew = 0;
  let withoutUsed = 0;
  let unpriced = 0;
  for (const item of items) {
    const newPrice = wishlistNewPrice(item);
    const usedPrice = wishlistUsedPrice(item);
    if (newPrice > 0) newCents += Math.round(newPrice * 100);
    else withoutNew += 1;
    if (usedPrice > 0) usedCents += Math.round(usedPrice * 100);
    else withoutUsed += 1;
    if (newPrice <= 0 && usedPrice <= 0) unpriced += 1;
  }
  return { newTotal: newCents / 100, usedTotal: usedCents / 100, withoutNew, withoutUsed, unpriced };
};
