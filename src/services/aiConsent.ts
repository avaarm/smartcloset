/**
 * Permission to send photos to third-party AI services.
 *
 * Photos you add or search with are analysed by Google Cloud Vision and OpenAI
 * (via our server). App Store guideline 5.1.2(i) requires clear disclosure and
 * explicit permission before personal data goes to a third-party AI, so the
 * first time a photo would leave the phone we ask, and remember the answer per
 * account. Saying no never blocks the app: items can be added by hand.
 */

import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';

export type AiConsent = 'granted' | 'denied' | null;

const consentKey = (userId: string) => `@smartcloset_ai_consent_v1:${userId}`;

const getUserId = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
};

export const getAiConsent = async (): Promise<AiConsent> => {
  const userId = await getUserId();
  if (!userId) return null;
  try {
    const v = await AsyncStorage.getItem(consentKey(userId));
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
};

export const setAiConsent = async (value: 'granted' | 'denied'): Promise<void> => {
  const userId = await getUserId();
  if (!userId) return;
  await AsyncStorage.setItem(consentKey(userId), value);
};

export const AI_CONSENT_ERROR = 'ai_consent_required';
export const isAiConsentError = (err: unknown): boolean =>
  (err as any)?.message === AI_CONSENT_ERROR;

let pendingPrompt: Promise<boolean> | null = null;

/**
 * Resolves true if photos may be sent. Asks once if the user has not decided;
 * concurrent callers (e.g. two analysis calls started together) share one prompt.
 */
export const ensureAiConsent = (): Promise<boolean> => {
  if (pendingPrompt) return pendingPrompt;
  pendingPrompt = (async () => {
    const userId = await getUserId();
    if (!userId) return false;

    const current = await getAiConsent();
    if (current === 'granted') return true;
    if (current === 'denied') return false;

    const allowed = await new Promise<boolean>(resolve => {
      Alert.alert(
        'Use AI to identify your items?',
        'To fill in details automatically and find similar items, SmartCloset sends the photo you choose to Google Cloud Vision and OpenAI. They analyse it and send back what they find (such as category, color, brand and material). If you use color analysis, the selfie you pick is sent to Google Cloud Vision to estimate skin tone.\n\nYour photo is used only to analyse it. You can change this any time in Settings. If you choose Not now, you can still add items by entering the details yourself.',
        [
          { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Allow', onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    });
    await setAiConsent(allowed ? 'granted' : 'denied');
    return allowed;
  })().finally(() => {
    pendingPrompt = null;
  });
  return pendingPrompt;
};
