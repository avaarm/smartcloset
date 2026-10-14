/**
 * The AI permission has three stored values: 'granted' (photos), 'granted_tags' (photos, and the words read from a
 * tag may go to OpenAI too) and 'denied'. Everything outside aiConsent.ts sees 'granted_tags' as 'granted'.
 */
let mockUser: { id: string } | null = { id: 'user-1' };
const mockFlags = { TAG_MODEL_FALLBACK_ENABLED: false };
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: mockUser ? { user: mockUser, access_token: 'tok' } : null } }) } },
}));
jest.mock('../../src/config/ratingFlags', () => ({
  get TAG_MODEL_FALLBACK_ENABLED() {
    return mockFlags.TAG_MODEL_FALLBACK_ENABLED;
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import type { Alert as AlertType } from 'react-native';
import type AsyncStorageType from '@react-native-async-storage/async-storage';

// The module keeps one thing in memory (who said "Not now" to the tag-text question), so every test loads a fresh copy.
type Consent = typeof import('../../src/services/aiConsent');
let ensureAiConsent: Consent['ensureAiConsent'];
let getAiConsent: Consent['getAiConsent'];
let hasTagTextConsent: Consent['hasTagTextConsent'];
let setAiConsent: Consent['setAiConsent'];
let aiConsentBody: Consent['aiConsentBody'];
let AsyncStorage: typeof AsyncStorageType;
let Alert: typeof AlertType;

const storageOf = (mod: any): typeof AsyncStorageType => mod.default ?? mod;
const KEY = (id: string) => `@smartcloset_ai_consent_v1:${id}`;
const stored = () => AsyncStorage.getItem(KEY('user-1'));

type Button = { text: string; onPress: () => void };
type Answer = 'Allow' | 'Not now';

/** Answers the alerts in order, one answer each; records what was asked and whether two were ever open together. */
const answering = (answers: Answer[]) => {
  const shown: Array<{ title: string; body: string; buttons: string[] }> = [];
  let open = 0;
  let overlapped = false;
  const spy = jest.spyOn(Alert, 'alert').mockImplementation((title: string, body?: string, buttons?: any) => {
    const list = buttons as Button[];
    shown.push({ title, body: body ?? '', buttons: list.map(b => b.text) });
    const answer = answers.shift();
    if (!answer) throw new Error(`unexpected alert: ${title}`);
    open += 1;
    if (open > 1) overlapped = true;
    setTimeout(() => {
      open -= 1;
      list.find(b => b.text === answer)!.onPress();
    }, 0);
  });
  return { spy, shown, overlapped: () => overlapped };
};

const BODY_OFF =
  'To fill in details automatically and find similar items, SmartCloset sends the photo you choose to Google Cloud Vision and OpenAI. They analyse it and send back what they find (such as category, color, brand and material). Photos of clothing tags and labels are read by Google Cloud Vision to fill in materials, care and country of origin. If you use color analysis, the selfie you pick is sent to Google Cloud Vision to estimate skin tone.\n\nYour photo is used only to analyse it. You can change this any time in Settings. If you choose Not now, you can still add items by entering the details yourself.';
const BODY_ON =
  'To fill in details automatically and find similar items, SmartCloset sends the photo you choose to Google Cloud Vision and OpenAI. They analyse it and send back what they find (such as category, color, brand and material). Photos of clothing tags and labels are read by Google Cloud Vision, and the words it finds (not the photo) may be sent to OpenAI to sort out the fabric lines. If you use color analysis, the selfie you pick is sent to Google Cloud Vision to estimate skin tone.\n\nYour photo is used only to analyse it. You can change this any time in Settings. If you choose Not now, you can still add items by entering the details yourself.';
const UPGRADE_TITLE = 'Read tag text with AI?';
const UPGRADE_BODY =
  'SmartCloset reads the photo of a tag with Google Cloud Vision. To sort out tricky fabric lines it can also send the words it found (not the photo) to OpenAI. You can still scan tags without this.';

beforeEach(async () => {
  jest.resetModules();
  const consent: Consent = require('../../src/services/aiConsent');
  ({ ensureAiConsent, getAiConsent, hasTagTextConsent, setAiConsent, aiConsentBody } = consent);
  AsyncStorage = storageOf(require('@react-native-async-storage/async-storage'));
  Alert = require('react-native').Alert;
  await AsyncStorage.clear();
  mockUser = { id: 'user-1' };
  mockFlags.TAG_MODEL_FALLBACK_ENABLED = false;
  jest.restoreAllMocks();
});

describe('what is stored', () => {
  it('reports granted_tags as granted and an unknown value as undecided', async () => {
    await AsyncStorage.setItem(KEY('user-1'), 'granted_tags');
    expect(await getAiConsent()).toBe('granted');
    await AsyncStorage.setItem(KEY('user-1'), 'granted');
    expect(await getAiConsent()).toBe('granted');
    await AsyncStorage.setItem(KEY('user-1'), 'denied');
    expect(await getAiConsent()).toBe('denied');
    await AsyncStorage.setItem(KEY('user-1'), 'maybe');
    expect(await getAiConsent()).toBeNull();
  });

  it('says tag text is allowed only for granted_tags', async () => {
    expect(await hasTagTextConsent()).toBe(false);
    await AsyncStorage.setItem(KEY('user-1'), 'granted');
    expect(await hasTagTextConsent()).toBe(false);
    await AsyncStorage.setItem(KEY('user-1'), 'denied');
    expect(await hasTagTextConsent()).toBe(false);
    await AsyncStorage.setItem(KEY('user-1'), 'granted_tags');
    expect(await hasTagTextConsent()).toBe(true);
  });

  it('says tag text is not allowed when signed out', async () => {
    await AsyncStorage.setItem(KEY('user-1'), 'granted_tags');
    mockUser = null;
    expect(await hasTagTextConsent()).toBe(false);
    expect(await getAiConsent()).toBeNull();
  });

  it('stores granted_tags only when asked to', async () => {
    await setAiConsent('granted');
    expect(await stored()).toBe('granted');
    await setAiConsent('granted', { tagText: false });
    expect(await stored()).toBe('granted');
    await setAiConsent('granted', { tagText: true });
    expect(await stored()).toBe('granted_tags');
    await setAiConsent('denied', { tagText: true });
    expect(await stored()).toBe('denied');
  });

  it('stores nothing when signed out', async () => {
    mockUser = null;
    await setAiConsent('granted', { tagText: true });
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});

describe('ensureAiConsent for photos', () => {
  it('lets granted and granted_tags through without asking', async () => {
    const { spy } = answering([]);
    await AsyncStorage.setItem(KEY('user-1'), 'granted');
    expect(await ensureAiConsent()).toBe(true);
    await AsyncStorage.setItem(KEY('user-1'), 'granted_tags');
    expect(await ensureAiConsent()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses denied without asking', async () => {
    const { spy } = answering([]);
    await AsyncStorage.setItem(KEY('user-1'), 'denied');
    expect(await ensureAiConsent()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('stores granted while the tag-text step is off, and says nothing about sending tag text on', async () => {
    const { shown } = answering(['Allow']);
    expect(await ensureAiConsent()).toBe(true);
    expect(await stored()).toBe('granted');
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe('Use AI to identify your items?');
    expect(shown[0].body).toBe(BODY_OFF);
    expect(shown[0].buttons).toEqual(['Not now', 'Allow']);
    expect(await hasTagTextConsent()).toBe(false);
  });

  it('stores granted_tags when the tag-text step is on, because the text then covers it', async () => {
    mockFlags.TAG_MODEL_FALLBACK_ENABLED = true;
    const { shown } = answering(['Allow']);
    expect(await ensureAiConsent()).toBe(true);
    expect(await stored()).toBe('granted_tags');
    expect(shown[0].body).toBe(BODY_ON);
    expect(await hasTagTextConsent()).toBe(true);
    expect(await getAiConsent()).toBe('granted');
  });

  it.each([false, true])('stores denied on "Not now" (tag-text step on: %s)', async on => {
    mockFlags.TAG_MODEL_FALLBACK_ENABLED = on;
    const { spy } = answering(['Not now']);
    expect(await ensureAiConsent()).toBe(false);
    expect(await stored()).toBe('denied');
    expect(await ensureAiConsent()).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('shares one prompt between callers started together', async () => {
    const { spy } = answering(['Allow']);
    const results = await Promise.all([ensureAiConsent(), ensureAiConsent(), ensureAiConsent()]);
    expect(results).toEqual([true, true, true]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('never asks when signed out', async () => {
    mockUser = null;
    const { spy } = answering([]);
    expect(await ensureAiConsent()).toBe(false);
    expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('the wording of the permission alert', () => {
  it('follows the tag-text switch', () => {
    expect(aiConsentBody()).toBe(BODY_OFF);
    mockFlags.TAG_MODEL_FALLBACK_ENABLED = true;
    expect(aiConsentBody()).toBe(BODY_ON);
  });

  it('can be asked for either wording', () => {
    expect(aiConsentBody(false)).toBe(BODY_OFF);
    expect(aiConsentBody(true)).toBe(BODY_ON);
  });

  it('only promises sending tag text to OpenAI in the wording that stores it', () => {
    expect(BODY_OFF).not.toMatch(/sent to OpenAI/);
    expect(BODY_ON).toMatch(/words it finds \(not the photo\) may be sent to OpenAI/);
    expect(BODY_OFF).toMatch(/tags and labels are read by Google Cloud Vision to fill in materials, care and country of origin/);
  });
});

describe('ensureAiConsent for tag text', () => {
  it('lets granted_tags through without asking', async () => {
    const { spy } = answering([]);
    await AsyncStorage.setItem(KEY('user-1'), 'granted_tags');
    expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses denied without asking', async () => {
    const { spy } = answering([]);
    await AsyncStorage.setItem(KEY('user-1'), 'denied');
    expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(await stored()).toBe('denied');
  });

  it('shows the normal alert when nothing is stored, and "Allow" stores granted_tags', async () => {
    mockFlags.TAG_MODEL_FALLBACK_ENABLED = true;
    const { shown } = answering(['Allow']);
    expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(true);
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe('Use AI to identify your items?');
    expect(shown[0].body).toBe(BODY_ON);
    expect(await stored()).toBe('granted_tags');
  });

  it('uses the wording that covers tag text whenever "Allow" would store granted_tags', async () => {
    const { shown } = answering(['Allow']);
    expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(true);
    expect(shown[0].body).toBe(BODY_ON);
    expect(await stored()).toBe('granted_tags');
  });

  it('stores denied when the first question is declined', async () => {
    const { spy } = answering(['Not now']);
    expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(false);
    expect(await stored()).toBe('denied');
    expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  describe('after agreeing to photos under the older wording', () => {
    beforeEach(async () => {
      await AsyncStorage.setItem(KEY('user-1'), 'granted');
    });

    it('asks the upgrade question, and "Allow" stores granted_tags', async () => {
      const { shown } = answering(['Allow']);
      expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(true);
      expect(shown).toEqual([{ title: UPGRADE_TITLE, body: UPGRADE_BODY, buttons: ['Not now', 'Allow'] }]);
      expect(await stored()).toBe('granted_tags');
      expect(await hasTagTextConsent()).toBe(true);
    });

    it('does not ask again once allowed', async () => {
      const { spy } = answering(['Allow']);
      await ensureAiConsent({ feature: 'tag_text' });
      expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('"Not now" says no for this call, leaves the stored answer alone and keeps photos working', async () => {
      const { spy } = answering(['Not now']);
      expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(false);
      expect(await stored()).toBe('granted');
      expect(await getAiConsent()).toBe('granted');
      expect(await ensureAiConsent()).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('does not ask again in the same run after "Not now", and the stored answer stays untouched', async () => {
      const { spy } = answering(['Not now']);
      expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(false);
      expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(false);
      expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(await stored()).toBe('granted');
    });

    it('remembers "Not now" for that account only', async () => {
      const { shown } = answering(['Not now', 'Allow']);
      expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(false);
      mockUser = { id: 'user-2' };
      await AsyncStorage.setItem(KEY('user-2'), 'granted');
      expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(true);
      expect(shown).toHaveLength(2);
      expect(await AsyncStorage.getItem(KEY('user-2'))).toBe('granted_tags');
      expect(await AsyncStorage.getItem(KEY('user-1'))).toBe('granted');
    });

    it('asks again after the app restarts, because "Not now" is kept in memory only', async () => {
      const first = answering(['Not now']);
      expect(await ensureAiConsent({ feature: 'tag_text' })).toBe(false);
      expect(first.spy).toHaveBeenCalledTimes(1);

      // Nothing about the decline is written down: one key, still 'granted'.
      const onDevice = await AsyncStorage.multiGet(await AsyncStorage.getAllKeys());
      expect(onDevice).toEqual([[KEY('user-1'), 'granted']]);

      // A restart is a fresh module registry: the in-memory answer is gone, the device storage is not.
      jest.resetModules();
      const fresh: Consent = require('../../src/services/aiConsent');
      AsyncStorage = storageOf(require('@react-native-async-storage/async-storage'));
      Alert = require('react-native').Alert;
      await AsyncStorage.multiSet(onDevice.map(([k, v]) => [k, v as string]));
      const second = answering(['Allow']);
      expect(await fresh.ensureAiConsent({ feature: 'tag_text' })).toBe(true);
      expect(second.shown.map(s => s.title)).toEqual([UPGRADE_TITLE]);
    });

    it('shares one question between callers started together', async () => {
      const { spy } = answering(['Allow']);
      const results = await Promise.all([
        ensureAiConsent({ feature: 'tag_text' }),
        ensureAiConsent({ feature: 'tag_text' }),
        ensureAiConsent({ feature: 'tag_text' }),
      ]);
      expect(results).toEqual([true, true, true]);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  it('never has the photo question and the tag question open at the same time', async () => {
    // Nothing stored, tag-text step off: the photo question stores 'granted', so the tag question that was waiting behind it is the upgrade.
    const run = answering(['Allow', 'Allow']);
    const [photo, tag] = await Promise.all([ensureAiConsent(), ensureAiConsent({ feature: 'tag_text' })]);
    expect([photo, tag]).toEqual([true, true]);
    expect(run.overlapped()).toBe(false);
    expect(run.shown.map(s => s.title)).toEqual(['Use AI to identify your items?', UPGRADE_TITLE]);
    expect(await stored()).toBe('granted_tags');
  });

  it('needs only one question when the photo wording already covers tag text', async () => {
    mockFlags.TAG_MODEL_FALLBACK_ENABLED = true;
    const run = answering(['Allow']);
    const [photo, tag] = await Promise.all([ensureAiConsent(), ensureAiConsent({ feature: 'tag_text' })]);
    expect([photo, tag]).toEqual([true, true]);
    expect(run.shown).toHaveLength(1);
    expect(await stored()).toBe('granted_tags');
  });

  it('lets the tag question wait behind a photo question that is declined', async () => {
    const run = answering(['Not now']);
    const [photo, tag] = await Promise.all([ensureAiConsent(), ensureAiConsent({ feature: 'tag_text' })]);
    expect([photo, tag]).toEqual([false, false]);
    expect(run.shown).toHaveLength(1);
    expect(await stored()).toBe('denied');
  });
});
