/**
 * Permission to send photos to third-party AI services.
 *
 * Photos you add or search with are analysed by Google Cloud Vision and OpenAI
 * (via our server). App Store guideline 5.1.2(i) requires clear disclosure and
 * explicit permission before personal data goes to a third-party AI, so the
 * first time a photo would leave the phone we ask, and remember the answer per
 * account. Saying no never blocks the app: items can be added by hand.
 *
 * The stored answer has three values: 'granted' (photos), 'granted_tags' (photos,
 * and the words read from a tag may go to OpenAI as well) and 'denied'. Everything
 * outside this file sees 'granted_tags' as 'granted'; only the tag step asks
 * for the stronger one (ensureAiConsent with feature 'tag_text').
 */

import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import { TAG_MODEL_FALLBACK_ENABLED } from '../config/ratingFlags';

export type AiConsent = 'granted' | 'denied' | null;
export type AiFeature = 'tag_text';

type StoredConsent = 'granted' | 'granted_tags' | 'denied';

const consentKey = (userId: string) => `@smartcloset_ai_consent_v1:${userId}`;

const getUserId = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
};

const readStored = async (userId: string): Promise<StoredConsent | null> => {
  try {
    const v = await AsyncStorage.getItem(consentKey(userId));
    return v === 'granted' || v === 'granted_tags' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
};

export const getAiConsent = async (): Promise<AiConsent> => {
  const userId = await getUserId();
  if (!userId) return null;
  const stored = await readStored(userId);
  if (stored === 'denied') return 'denied';
  return stored === 'granted' || stored === 'granted_tags' ? 'granted' : null;
};

/** True only when the person agreed to the wording that covers sending the words read from a tag to OpenAI. */
export const hasTagTextConsent = async (): Promise<boolean> => {
  const userId = await getUserId();
  if (!userId) return false;
  return (await readStored(userId)) === 'granted_tags';
};

/** `tagText` is only meaningful with 'granted': pass it only when the text the person saw covered tag text. */
export const setAiConsent = async (value: 'granted' | 'denied', opts?: { tagText?: boolean }): Promise<void> => {
  const userId = await getUserId();
  if (!userId) return;
  await AsyncStorage.setItem(consentKey(userId), value === 'granted' && opts?.tagText === true ? 'granted_tags' : value);
};

export const AI_CONSENT_ERROR = 'ai_consent_required';
export const isAiConsentError = (err: unknown): boolean =>
  (err as any)?.message === AI_CONSENT_ERROR;

const PHOTO_SENTENCE =
  'To fill in details automatically and find similar items, SmartCloset sends the photo you choose to Google Cloud Vision and OpenAI. They analyse it and send back what they find (such as category, color, brand and material).';
const TAG_SENTENCE_PHOTO_ONLY =
  'Photos of clothing tags and labels are read by Google Cloud Vision to fill in materials, care and country of origin.';
const TAG_SENTENCE_WITH_TEXT =
  'Photos of clothing tags and labels are read by Google Cloud Vision, and the words it finds (not the photo) may be sent to OpenAI to sort out the fabric lines.';
const SELFIE_SENTENCE =
  'If you use color analysis, the selfie you pick is sent to Google Cloud Vision to estimate skin tone.';
const CLOSING =
  'Your photo is used only to analyse it. You can change this any time in Settings. If you choose Not now, you can still add items by entering the details yourself.';

/**
 * The text of the permission alert. With `tagText` the tag sentence also says the words read from a tag may go to
 * OpenAI; the default follows TAG_MODEL_FALLBACK_ENABLED, so the wording only promises what the build does.
 * Settings uses it for its own description of the setting.
 */
export const aiConsentBody = (tagText: boolean = TAG_MODEL_FALLBACK_ENABLED): string =>
  `${PHOTO_SENTENCE} ${tagText ? TAG_SENTENCE_WITH_TEXT : TAG_SENTENCE_PHOTO_ONLY} ${SELFIE_SENTENCE}\n\n${CLOSING}`;

const UPGRADE_TITLE = 'Read tag text with AI?';
const UPGRADE_BODY =
  'SmartCloset reads the photo of a tag with Google Cloud Vision. To sort out tricky fabric lines it can also send the words it found (not the photo) to OpenAI. You can still scan tags without this.';

const ask = (title: string, body: string): Promise<boolean> =>
  new Promise<boolean>(resolve => {
    Alert.alert(
      title,
      body,
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Allow', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });

// People who said "Not now" to the tag-text upgrade in this run. Memory only, so the question comes back after a restart.
const upgradeDeclined = new Set<string>();

type PromptKey = 'photo' | AiFeature;
const pendingPrompts: Partial<Record<PromptKey, Promise<boolean>>> = {};

const decide = async (feature: AiFeature | undefined): Promise<boolean> => {
  const userId = await getUserId();
  if (!userId) return false;

  const stored = await readStored(userId);
  if (stored === 'denied') return false;

  if (!feature) {
    if (stored === 'granted' || stored === 'granted_tags') return true;
    const allowed = await ask('Use AI to identify your items?', aiConsentBody());
    await setAiConsent(allowed ? 'granted' : 'denied', { tagText: allowed && TAG_MODEL_FALLBACK_ENABLED });
    return allowed;
  }

  // feature === 'tag_text'
  if (stored === 'granted_tags') return true;
  if (stored === 'granted') {
    // Agreed to photos under the older wording: ask once about the words read from a tag. Declining leaves photo
    // analysis as it was.
    if (upgradeDeclined.has(userId)) return false;
    const allowed = await ask(UPGRADE_TITLE, UPGRADE_BODY);
    if (!allowed) {
      upgradeDeclined.add(userId);
      return false;
    }
    await setAiConsent('granted', { tagText: true });
    return true;
  }
  // Nothing stored yet: the normal alert, in the wording that covers tag text, because "Allow" stores granted_tags.
  const allowed = await ask('Use AI to identify your items?', aiConsentBody(true));
  await setAiConsent(allowed ? 'granted' : 'denied', { tagText: allowed });
  return allowed;
};

/**
 * Resolves true if photos (or, with feature 'tag_text', the words read from a tag) may be sent. Asks once if the
 * person has not decided; concurrent callers for the same thing (e.g. two analysis calls started together) share
 * one prompt, and the two kinds of prompt never show at the same time.
 */
export const ensureAiConsent = (opts?: { feature?: AiFeature }): Promise<boolean> => {
  const feature = opts?.feature;
  const key: PromptKey = feature ?? 'photo';
  const existing = pendingPrompts[key];
  if (existing) return existing;
  const other = pendingPrompts[key === 'photo' ? 'tag_text' : 'photo'];
  const prompt = (async () => {
    if (other) await other.catch(() => undefined);
    return decide(feature);
  })().finally(() => {
    delete pendingPrompts[key];
  });
  pendingPrompts[key] = prompt;
  return prompt;
};
