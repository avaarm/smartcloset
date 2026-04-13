/**
 * useProfileColorMatch — hook that checks whether a clothing item's color
 * matches the user's body profile recommended palette.
 *
 * Returns a status per item:
 *   - 'match'   → the item color is in the recommended palette
 *   - 'avoid'   → the item color is in the avoid list
 *   - 'neutral' → no strong signal either way
 *   - null      → no profile exists or item has no color
 */

import { useCallback, useEffect, useState } from 'react';
import { BodyProfile, getBodyProfile } from '../services/profileService';
import { colorNameToHex, paletteMatchScore } from '../services/styleRulesEngine';

export type ProfileColorStatus = 'match' | 'avoid' | 'neutral' | null;

export const useProfileColorMatch = () => {
  const [profile, setProfile] = useState<BodyProfile | null>(null);

  useEffect(() => {
    getBodyProfile().then(p => setProfile(p)).catch(() => {});
  }, []);

  const getColorStatus = useCallback(
    (colorName?: string): ProfileColorStatus => {
      if (!profile || !colorName) return null;

      const hex = colorNameToHex(colorName);
      if (!hex) return null;

      const recScore = paletteMatchScore(profile.recommendedPalette, hex);
      const avoidScore = paletteMatchScore(profile.avoidColors, hex);

      if (recScore > 0.5 && recScore > avoidScore) return 'match';
      if (avoidScore > 0.5 && avoidScore > recScore) return 'avoid';
      return 'neutral';
    },
    [profile],
  );

  return {
    profile,
    hasProfile: !!profile,
    getColorStatus,
  };
};
