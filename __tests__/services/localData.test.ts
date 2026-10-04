import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { adoptPersonalLocalData, clearPersonalLocalData, stashPersonalLocalData } from '../../src/services/localData';

// Per-person data with no account id in the key: filed per account on sign-out.
const PERSONAL = [
  '@smartcloset_body_profile',
  '@smartcloset_style_prefs',
  '@smartcloset_lookbooks',
  '@smartcloset_color_season',
  '@smartcloset_product_contributions',
  '@smartcloset_current_mode',
  '@smartcloset_available_modes',
  '@smartcloset_account_type',
];

// Guest / demo content: belongs to the device's guest session, must survive.
const GUEST = [
  '@smartcloset_items',
  '@smartcloset_saved_outfits',
  '@smartcloset_outfit_history',
  '@smartcloset_initialized_v6',
  '@smartcloset_demo_seeded_v4',
  '@smartcloset_initialized',
  '@smartcloset_user_profile',
  '@smartcloset_stylist_profile',
  '@smartcloset_stylist_clients',
  '@smartcloset_stylist_appointments',
  '@smartcloset_stylist_recommendations',
  '@smartcloset_stylist_notes',
  '@smartcloset_stylist_listings',
  '@smartcloset_stylist_reviews',
  '@smartcloset_booking_requests',
  '@smartcloset_client_accounts',
  '@smartcloset_current_client',
  '@smartcloset_message_threads',
  '@smartcloset_messages',
  '@smartcloset_notifications',
  '@smartcloset_relationships',
  // Unused legacy module (src/utils/storage.ts), still a guest wardrobe if present.
  '@smartcloset/wardrobe',
  '@smartcloset/outfits',
  '@smartcloset/wishlist',
];

// Device preferences, and flags already keyed by user id (so they cannot leak).
const DEVICE_OR_PER_ACCOUNT = [
  '@smartcloset_color_scheme_preference',
  '@smartcloset_last_backup',
  '@smartcloset_auto_backup',
  '@smartcloset_signed_image_urls_v1', // cleared separately by clearSignedImageCache
  '@smartcloset_ai_consent_v1',
  '@smartcloset_share_product_data',
  '@smartcloset_mode_onboarded',
];

// Bookkeeping for the per-person slots: who they currently belong to.
const INTERNAL = ['@smartcloset_personal_owner'];

const seed = async (keys: string[]) => {
  for (const k of keys) await AsyncStorage.setItem(k, `value-of-${k}`);
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('clearPersonalLocalData', () => {
  it('removes exactly the per-person keys and nothing else', async () => {
    const keptBefore = [...GUEST, ...DEVICE_OR_PER_ACCOUNT, '@smartcloset_ai_consent_v1:user-1'];
    await seed([...PERSONAL, ...keptBefore, 'sb-example-auth-token']);

    await clearPersonalLocalData();

    const remaining = (await AsyncStorage.getAllKeys()).slice().sort();
    expect(remaining).toEqual([...keptBefore, 'sb-example-auth-token'].sort());
  });

  it("leaves a guest's wardrobe, outfits and wear history untouched", async () => {
    const wardrobe = JSON.stringify([{ id: '1', name: 'Denim jacket' }]);
    await AsyncStorage.setItem('@smartcloset_items', wardrobe);
    await AsyncStorage.setItem('@smartcloset_saved_outfits', '[{"id":"o1"}]');
    await AsyncStorage.setItem('@smartcloset_outfit_history', '[{"id":"h1"}]');
    await AsyncStorage.setItem('@smartcloset_body_profile', '{"skinTone":"deep"}');

    await clearPersonalLocalData();

    expect(await AsyncStorage.getItem('@smartcloset_items')).toBe(wardrobe);
    expect(await AsyncStorage.getItem('@smartcloset_saved_outfits')).toBe('[{"id":"o1"}]');
    expect(await AsyncStorage.getItem('@smartcloset_outfit_history')).toBe('[{"id":"h1"}]');
    expect(await AsyncStorage.getItem('@smartcloset_body_profile')).toBeNull();
  });

  it('does nothing harmful when there is nothing to clear', async () => {
    await expect(clearPersonalLocalData()).resolves.toBeUndefined();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it('never throws if storage fails, so a finished sign-out is not reported as failed', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'multiRemove').mockRejectedValueOnce(new Error('disk'));
    await expect(clearPersonalLocalData()).resolves.toBeUndefined();
  });
});

describe('key classification', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.tsx?$/.test(e.name) ? [p] : [];
    });

  // Fails when someone adds a storage key without deciding whether it is
  // per-person data (add it to PERSONAL_KEYS in localData.ts) or safe to keep.
  it('every @smartcloset storage key in src is classified', () => {
    const known = new Set([...PERSONAL, ...GUEST, ...DEVICE_OR_PER_ACCOUNT, ...INTERNAL]);
    const found = new Set<string>();
    for (const file of walk(path.join(__dirname, '../../src'))) {
      const text = fs.readFileSync(file, 'utf8');
      // The lookbehind skips email addresses such as alex@smartcloset.app.
      for (const m of text.matchAll(/(?<![A-Za-z0-9._-])@smartcloset[A-Za-z0-9_/]*/g)) {
        const key = m[0].replace(/_+$/, ''); // `@smartcloset_foo_${id}` -> prefix
        if (key !== '@smartcloset') found.add(key);
      }
    }
    expect([...found].filter(k => !known.has(k)).sort()).toEqual([]);
  });
});


describe('per-account stash and restore', () => {
  const put = (k: string, v: string) => AsyncStorage.setItem(k, v);
  const get = (k: string) => AsyncStorage.getItem(k);

  it("keeps one account's data away from the next and gives it back on return", async () => {
    // A signs in on a clean device, then builds up some on-device data.
    await adoptPersonalLocalData('A');
    await put('@smartcloset_lookbooks', 'A-looks');
    await put('@smartcloset_style_prefs', 'A-style');
    await put('@smartcloset_product_contributions', 'A-items');

    await stashPersonalLocalData('A'); // A signs out
    expect(await get('@smartcloset_lookbooks')).toBeNull();

    await adoptPersonalLocalData('B'); // B signs in: sees none of A's
    expect(await get('@smartcloset_lookbooks')).toBeNull();
    expect(await get('@smartcloset_product_contributions')).toBeNull();
    await put('@smartcloset_lookbooks', 'B-looks');
    await stashPersonalLocalData('B');

    await adoptPersonalLocalData('A'); // A is back
    expect(await get('@smartcloset_lookbooks')).toBe('A-looks');
    expect(await get('@smartcloset_style_prefs')).toBe('A-style');
    expect(await get('@smartcloset_product_contributions')).toBe('A-items');

    await stashPersonalLocalData('A');
    await adoptPersonalLocalData('B');
    expect(await get('@smartcloset_lookbooks')).toBe('B-looks');
  });

  it("files a previous account's data when their sign-out never ran (expired session)", async () => {
    await adoptPersonalLocalData('A');
    await put('@smartcloset_lookbooks', 'A-looks');
    // No stash for A: the session just vanished. B signs in next.
    await adoptPersonalLocalData('B');
    expect(await get('@smartcloset_lookbooks')).toBeNull();
    await stashPersonalLocalData('B');
    await adoptPersonalLocalData('A');
    expect(await get('@smartcloset_lookbooks')).toBe('A-looks');
  });

  it("lets a new account keep what a guest made on the device", async () => {
    await put('@smartcloset_style_prefs', 'guest-style');
    await adoptPersonalLocalData('A');
    expect(await get('@smartcloset_style_prefs')).toBe('guest-style');
  });

  it("prefers an account's own saved data over a guest's leftovers", async () => {
    await adoptPersonalLocalData('A');
    await put('@smartcloset_style_prefs', 'A-style');
    await stashPersonalLocalData('A');
    await put('@smartcloset_style_prefs', 'guest-style');
    await adoptPersonalLocalData('A');
    expect(await get('@smartcloset_style_prefs')).toBe('A-style');
  });

  it('is a no-op when the same account signs in again', async () => {
    await adoptPersonalLocalData('A');
    await put('@smartcloset_lookbooks', 'A-looks');
    await adoptPersonalLocalData('A');
    expect(await get('@smartcloset_lookbooks')).toBe('A-looks');
  });

  it('resets the account mode on sign-out instead of carrying it over', async () => {
    await adoptPersonalLocalData('A');
    await put('@smartcloset_current_mode', 'stylist');
    await stashPersonalLocalData('A');
    expect(await get('@smartcloset_current_mode')).toBeNull();
    await adoptPersonalLocalData('A');
    expect(await get('@smartcloset_current_mode')).toBeNull();
  });

  it('never throws if storage fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'multiGet').mockRejectedValue(new Error('disk'));
    await expect(stashPersonalLocalData('A')).resolves.toBeUndefined();
    await expect(adoptPersonalLocalData('A')).resolves.toBeUndefined();
  });
});
