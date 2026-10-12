/**
 * After an item is added: count what it points to (women's or men's), and when the
 * wardrobe's audience has not been answered and the things so far point clearly one way,
 * ask once, with the app's guess as the first answer. "Not now" is remembered too, so the
 * question is never repeated; Home keeps a card for it and Profile can change it any time.
 */

import { Alert } from 'react-native';
import {
  getWardrobeFor,
  markAsked,
  recordAudienceSignal,
  setWardrobeFor,
  suggestAudience,
  wardrobeForLabel,
  wasAsked,
  type WardrobeFor,
} from '../services/wardrobeAudience';

type AddedItem = {
  category?: string;
  subcategory?: string;
  name?: string;
  /** What the photo analysis said the item is for. */
  aiGender?: string;
};

export const noteAddedItem = async (item: AddedItem, opts: { ask: boolean } = { ask: true }): Promise<void> => {
  try {
    const signals = await recordAudienceSignal(item);
    if (!signals || !opts.ask) return;
    const [answer, asked] = await Promise.all([getWardrobeFor(), wasAsked()]);
    if (answer !== null || asked) return;
    const suggestion = suggestAudience(signals);
    if (!suggestion) return;

    const label = wardrobeForLabel(suggestion);
    const choose = (value: WardrobeFor) => async () => {
      try {
        await setWardrobeFor(value);
      } catch (e) {
        console.warn('[askWardrobeFor] could not save the answer:', e);
      }
    };
    const others = (['women', 'men', 'both'] as WardrobeFor[]).filter(v => v !== suggestion);
    await markAsked();
    Alert.alert(
      `Is this a ${label.toLowerCase()} wardrobe?`,
      `What you've added looks like ${label.toLowerCase()} pieces. Searches bring back the right fit and photos are read with it in mind. You can change this any time in Profile.`,
      [
        { text: `Yes, ${label}`, onPress: choose(suggestion) },
        ...others.map(v => ({ text: wardrobeForLabel(v), onPress: choose(v) })),
        { text: 'Not now', style: 'cancel' as const },
      ],
    );
  } catch (e) {
    console.warn('[askWardrobeFor] failed:', e);
  }
};
