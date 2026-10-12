/**
 * Who the wardrobe is for: women, men or both.
 *
 * The app shops and describes differently for each: a search for "ankle boots" should
 * bring back women's boots for a woman and men's for a man, and the photo analysis names
 * a blouse or a shirt accordingly. The answer comes from the person (Settings, or a prompt
 * on Home), and when they haven't said, the things they add give a hint: a dress, heels or
 * a "women's" listing point one way, so the app can suggest it and ask, never decide.
 *
 * Stored per account on the device (a guest has a key of its own, so one person's answer
 * never shows under another's), and copied to the account's profile so a new phone knows.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import { getAuthUserId } from './authUser';
import type { ClothingCategory } from '../types/clothing';

export type WardrobeFor = 'women' | 'men' | 'both';

export const WARDROBE_FOR_OPTIONS: ReadonlyArray<{ value: WardrobeFor; label: string }> = [
  { value: 'women', label: "Women's" },
  { value: 'men', label: "Men's" },
  { value: 'both', label: 'Both' },
];

export const isWardrobeFor = (v: unknown): v is WardrobeFor => v === 'women' || v === 'men' || v === 'both';

export const wardrobeForLabel = (v: WardrobeFor | null | undefined): string =>
  WARDROBE_FOR_OPTIONS.find(o => o.value === v)?.label ?? '';

const KEY = '@smartcloset_wardrobe_for';
const SIGNALS_KEY = '@smartcloset_wardrobe_for_signals';
const ASKED_KEY = '@smartcloset_wardrobe_for_asked';

const keyFor = (base: string, userId: string | null): string => (userId ? `${base}:u:${userId}` : `${base}:guest`);

// ─── The answer ──────────────────────────────────────────────────────────────

/** The saved answer for whoever is signed in (or the guest), or null when none was given. */
export const getWardrobeFor = async (): Promise<WardrobeFor | null> => {
  try {
    const userId = await getAuthUserId();
    const saved = await AsyncStorage.getItem(keyFor(KEY, userId));
    if (isWardrobeFor(saved)) return saved;
    if (!userId) return null;
    // Not on this device yet: the account may have been answered on another phone.
    const { data } = await supabase.auth.getSession();
    const fromProfile = data?.session?.user?.user_metadata?.wardrobe_for;
    if (isWardrobeFor(fromProfile)) {
      // Cached for next time; not being able to cache it must not hide the answer.
      await AsyncStorage.setItem(keyFor(KEY, userId), fromProfile).catch(() => {});
      return fromProfile;
    }
    return null;
  } catch (e) {
    console.warn('[wardrobeAudience] could not read the answer:', e);
    return null;
  }
};

/**
 * Saves the answer (null clears it). The device copy is written first and throws on failure,
 * so the screen can say it did not save; the copy on the account is best effort.
 */
export const setWardrobeFor = async (value: WardrobeFor | null): Promise<void> => {
  const userId = await getAuthUserId();
  const key = keyFor(KEY, userId);
  if (value === null) await AsyncStorage.removeItem(key);
  else {
    if (!isWardrobeFor(value)) throw new Error('wardrobe_for must be women, men or both');
    await AsyncStorage.setItem(key, value);
  }
  if (userId) {
    try {
      await supabase.auth.updateUser({ data: { wardrobe_for: value } });
    } catch (e) {
      console.warn('[wardrobeAudience] could not copy the answer to the account:', e);
    }
  }
};

// ─── What the things added so far suggest ────────────────────────────────────

export interface AudienceSignals {
  women: number;
  men: number;
}

/** What an item points to: heavier for things worn almost only by one, lighter for ones mostly worn by one. */
const WOMEN_TYPES: Record<string, number> = {
  skirt: 2, heels: 2, pumps: 2, blouse: 2, 'crop top': 2, 'evening gown': 2, 'cocktail dress': 2, bikini: 2,
  'sports bra': 2, bodysuit: 1, tunic: 1, 'wrap dress': 2, 'casual dress': 2, 'mini dress': 2, 'midi dress': 2,
  'maxi dress': 2, jumpsuit: 1, romper: 2, clutch: 2, earrings: 1, necklace: 1, anklet: 1, 'hair accessory': 1,
  flats: 1, wedges: 1, mules: 1, handbag: 1, capris: 1, 'wide-leg pants': 1, 'one-piece': 1, 'cover-up': 2,
};
const MEN_TYPES: Record<string, number> = { tie: 2, 'swim trunks': 2 };
const WOMEN_WORDS = /\b(?:women'?s|womens|women|woman'?s|ladies|lady'?s|female)\b/i;
const MEN_WORDS = /\b(?:men'?s|mens|men|man'?s|gents|male)\b/i;

/** Titles come with curly apostrophes (Women’s) from phones and shop sites; read them as straight ones. */
const straighten = (text: string): string => text.replace(/[\u2018\u2019\u02BC]/g, "'");

/** An own property of the table, so a type typed in as "constructor" is not read as something every object has. */
const pointsFor = (table: Record<string, number>, key: string): number =>
  Object.prototype.hasOwnProperty.call(table, key) ? table[key] : 0;

/**
 * Points toward women's or men's for one item: its category and type, what its name says, and
 * what the photo analysis called it. A single dress is a hint; it takes several to suggest anything.
 */
export const audienceSignal = (item: {
  category?: ClothingCategory | string;
  subcategory?: string;
  name?: string;
  /** What the photo analysis said the item is for: 'women', 'men' or 'unisex'. */
  aiGender?: string;
}): AudienceSignals => {
  let women = 0;
  let men = 0;
  if (item.category === 'dresses') women += 2;
  const type = (item.subcategory ?? '').trim().toLowerCase();
  women += pointsFor(WOMEN_TYPES, type);
  men += pointsFor(MEN_TYPES, type);
  const name = straighten(item.name ?? '');
  // Both sets of words are whole words, so "women's" never counts as "men's"; if a name has both, it points nowhere.
  if (WOMEN_WORDS.test(name) && MEN_WORDS.test(name)) {
    // e.g. "Men's and women's": no signal
  } else if (WOMEN_WORDS.test(name)) women += 3;
  else if (MEN_WORDS.test(name)) men += 3;
  if (item.aiGender === 'women') women += 2;
  else if (item.aiGender === 'men') men += 2;
  return { women, men };
};

/** The points need to lead by this much (and the other side stay small) before anything is suggested. */
export const SUGGESTION_LEAD = 3;

export const suggestAudience = (signals: AudienceSignals): 'women' | 'men' | null => {
  if (signals.women - signals.men >= SUGGESTION_LEAD && signals.men <= 1) return 'women';
  if (signals.men - signals.women >= SUGGESTION_LEAD && signals.women <= 1) return 'men';
  return null;
};

const readSignals = async (userId: string | null): Promise<AudienceSignals | null> => {
  try {
    const raw = await AsyncStorage.getItem(keyFor(SIGNALS_KEY, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Number.isFinite(parsed?.women) && Number.isFinite(parsed?.men) ? { women: parsed.women, men: parsed.men } : null;
  } catch {
    return null;
  }
};

// Two items added at the same moment would each read the old total and the second write would drop the first.
let recording: Promise<unknown> = Promise.resolve();

/** Adds an item's points to the running total. Best effort: a storage error never gets in the way of saving the item. */
export const recordAudienceSignal = (item: Parameters<typeof audienceSignal>[0]): Promise<AudienceSignals | null> => {
  const run = recording.then(() => addSignal(item));
  recording = run.catch(() => undefined);
  return run;
};

const addSignal = async (item: Parameters<typeof audienceSignal>[0]): Promise<AudienceSignals | null> => {
  try {
    const userId = await getAuthUserId();
    const current = (await readSignals(userId)) ?? { women: 0, men: 0 };
    const add = audienceSignal(item);
    const next = { women: current.women + add.women, men: current.men + add.men };
    await AsyncStorage.setItem(keyFor(SIGNALS_KEY, userId), JSON.stringify(next));
    return next;
  } catch (e) {
    console.warn('[wardrobeAudience] could not record a signal:', e);
    return null;
  }
};

/**
 * The suggestion from what the wardrobe holds: the running total, or, for a wardrobe built before
 * the app kept one, the items themselves (counted once and kept).
 */
export const getAudienceSuggestion = async (
  items: ReadonlyArray<Parameters<typeof audienceSignal>[0]> = [],
): Promise<'women' | 'men' | null> => {
  try {
    const userId = await getAuthUserId();
    let signals = await readSignals(userId);
    if (!signals && items.length > 0) {
      signals = items.reduce<AudienceSignals>(
        (sum, item) => {
          const s = audienceSignal(item);
          return { women: sum.women + s.women, men: sum.men + s.men };
        },
        { women: 0, men: 0 },
      );
      await AsyncStorage.setItem(keyFor(SIGNALS_KEY, userId), JSON.stringify(signals));
    }
    return signals ? suggestAudience(signals) : null;
  } catch (e) {
    console.warn('[wardrobeAudience] could not work out a suggestion:', e);
    return null;
  }
};

// ─── Asking once ─────────────────────────────────────────────────────────────

/** True once the person has been asked (and answered or said "not now"), so the question is not repeated. */
export const wasAsked = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(keyFor(ASKED_KEY, await getAuthUserId()))) === 'true';
  } catch {
    return false;
  }
};

export const markAsked = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(keyFor(ASKED_KEY, await getAuthUserId()), 'true');
  } catch (e) {
    console.warn('[wardrobeAudience] could not remember the question was asked:', e);
  }
};
