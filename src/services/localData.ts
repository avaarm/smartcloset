import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Everything the app keeps in AsyncStorage falls into one of four classes:
 *
 *  (a) Guest / demo content. It belongs to the device's guest session, not to an
 *      account, so signing out must leave it alone: the guest wardrobe
 *      (@smartcloset_items), saved outfits and wear history, the demo-seed flags
 *      (@smartcloset_initialized_v6, @smartcloset_demo_seeded_v4,
 *      @smartcloset_sample_photos_fix_v1). A signed-in user's wardrobe, outfits and wear
 *      history live in Supabase, so none of this is theirs.
 *  (b) Per-person data whose key carries no account id. On sign-out it is
 *      moved under the signed-out account's id, and moved back when that account
 *      signs in again, so the next person on this device (another account or a
 *      guest) never sees it and the owner never loses it. Lookbooks, style
 *      preferences, the colour season and the product-details history exist
 *      only on this device, so they must not be thrown away.
 *  (c) Harmless device preferences (theme, backup timestamps) and flags already
 *      keyed by user id (AI consent, product-sharing opt-in, the first-run prompt,
 *      the wishlist budget and who the wardrobe is for, which have a key
 *      per account and one for guests). They cannot leak to a different account, so they are kept.
 *  (d) Retired stores of the old on-device Stylist and Client simulation
 *      (RETIRED_PRO_KEYS). No screen reaches them and the demo seed no longer fills
 *      them; purgeLegacyProData removes what an earlier build left behind.
 *
 * Account deletion does not use this list: it wipes everything.
 */
const PERSONAL_KEYS = [
  '@smartcloset_body_profile', // skin tone, body type and the optional face photo path
  '@smartcloset_style_prefs',
  '@smartcloset_lookbooks',
  '@smartcloset_color_season',
  // Names, brands and prices of the items this person added (recordContribution
  // writes it for signed-in users too).
  '@smartcloset_product_contributions',
];

// Account mode: a guest left in the stylist workspace has no wardrobe tab. It is
// reset, not kept per account (every account starts in the normal closet mode).
const RESET_ONLY_KEYS = [
  '@smartcloset_current_mode',
];

/**
 * The device-local stores of the Stylist and Client simulation that was switched
 * off on 2026-10-04. Real stylist and client accounts live on the server and use
 * none of them, and they hold demo content or names, emails and phone numbers that
 * someone typed into the simulation, so purgeLegacyProData removes them.
 * @smartcloset_current_mode is not here: it is still the device's mode preference.
 */
export const RETIRED_PRO_KEYS: readonly string[] = [
  // Stylist side
  '@smartcloset_stylist_profile',
  '@smartcloset_stylist_clients',
  '@smartcloset_stylist_appointments',
  '@smartcloset_stylist_recommendations',
  '@smartcloset_stylist_notes',
  // Marketplace
  '@smartcloset_stylist_listings',
  '@smartcloset_stylist_reviews',
  '@smartcloset_booking_requests',
  // Client side
  '@smartcloset_client_accounts',
  '@smartcloset_current_client',
  // Messaging
  '@smartcloset_message_threads',
  '@smartcloset_messages',
  '@smartcloset_notifications',
  '@smartcloset_relationships',
  // Simulated account
  '@smartcloset_user_profile',
  '@smartcloset_account_type',
  '@smartcloset_available_modes',
];

// Whose data currently sits in the PERSONAL_KEYS slots; absent for a guest.
const OWNER_KEY = '@smartcloset_personal_owner';

const stashKey = (key: string, uid: string) => `${key}:u:${uid}`;

/** Wipes the per-person data with nothing kept, for when no account is known. Best
 * effort: never throws, so a storage error cannot make a completed sign-out look
 * like it failed. */
export const clearPersonalLocalData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([...PERSONAL_KEYS, ...RESET_ONLY_KEYS, OWNER_KEY]);
  } catch (e) {
    console.warn('[localData] could not clear personal data:', e);
  }
};

/** Moves the per-person data out of the shared slots and files it under `uid`. */
export const stashPersonalLocalData = async (uid: string): Promise<void> => {
  try {
    const pairs = await AsyncStorage.multiGet(PERSONAL_KEYS);
    const toStash = pairs.filter(([, v]) => v != null) as [string, string][];
    if (toStash.length > 0) {
      await AsyncStorage.multiSet(toStash.map(([k, v]) => [stashKey(k, uid), v] as [string, string]));
    }
    await AsyncStorage.multiRemove([...PERSONAL_KEYS, ...RESET_ONLY_KEYS, OWNER_KEY]);
  } catch (e) {
    console.warn('[localData] could not stash personal data:', e);
  }
};

/**
 * Call after `uid` signs in. Brings back what they saved on this device before.
 * If the slots still hold a different account's data (their sign-out never ran,
 * e.g. the session expired), that data is filed away under its owner first.
 * Slots with no owner are a guest's own work and are kept unless this account has
 * saved data of its own for that key.
 */
export const adoptPersonalLocalData = async (uid: string): Promise<void> => {
  try {
    const owner = await AsyncStorage.getItem(OWNER_KEY);
    if (owner === uid) return;
    if (owner) await stashPersonalLocalData(owner);

    const pairs = await AsyncStorage.multiGet(PERSONAL_KEYS.map(k => stashKey(k, uid)));
    const toRestore: [string, string][] = [];
    pairs.forEach(([, v], i) => {
      if (v != null) toRestore.push([PERSONAL_KEYS[i], v]);
    });
    if (toRestore.length > 0) await AsyncStorage.multiSet(toRestore);
    await AsyncStorage.setItem(OWNER_KEY, uid);
  } catch (e) {
    console.warn('[localData] could not restore personal data:', e);
  }
};

/**
 * Removes the retired Stylist and Client stores from this device. Call it at
 * launch. It is safe to run any number of times: a key that is not there is simply
 * not removed, and no completion flag is kept. Best effort: never throws, so a
 * storage error cannot get in the way of opening the app, and the next launch tries
 * again. It touches nothing but RETIRED_PRO_KEYS.
 */
export const purgeLegacyProData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([...RETIRED_PRO_KEYS]);
  } catch (e) {
    console.warn('[localData] could not remove retired stylist data:', e);
  }
};
