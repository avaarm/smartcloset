import type { BodyProfile } from '../services/profileService';
import { colorNameToHex, paletteMatchScore } from '../services/styleRulesEngine';

export type ColorMatch = 'match' | 'avoid' | null;

/**
 * Whether an item's color sits in the user's recommended palette or in their
 * avoid list. Pure: the caller loads the body profile once for the whole grid
 * instead of every card fetching it.
 */
export const getColorMatch = (
  profile: BodyProfile | null | undefined,
  colorName: string | undefined,
): ColorMatch => {
  if (!profile || !colorName) return null;
  const hex = colorNameToHex(colorName);
  if (!hex) return null;
  const recScore = paletteMatchScore(profile.recommendedPalette, hex);
  const avoidScore = paletteMatchScore(profile.avoidColors, hex);
  if (recScore > 0.5 && recScore > avoidScore) return 'match';
  if (avoidScore > 0.5 && avoidScore > recScore) return 'avoid';
  return null;
};
