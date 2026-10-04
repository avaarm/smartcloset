import { getColorMatch } from '../../src/components/clothingColorMatch';
import type { BodyProfile } from '../../src/services/profileService';

const profile: BodyProfile = {
  skinTone: 'medium',
  undertone: 'warm',
  bodyType: 'rectangle',
  recommendedPalette: ['#000000'],
  avoidColors: ['#FFFFFF'],
  recommendedFits: { tops: [], bottoms: [], dresses: [] },
  sizeHints: {},
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('getColorMatch', () => {
  it('flags colors in the recommended palette and in the avoid list', () => {
    expect(getColorMatch(profile, 'black')).toBe('match');
    expect(getColorMatch(profile, 'white')).toBe('avoid');
  });

  it('says nothing without a profile, a color, or a color it can place', () => {
    expect(getColorMatch(null, 'black')).toBeNull();
    expect(getColorMatch(undefined, 'black')).toBeNull();
    expect(getColorMatch(profile, undefined)).toBeNull();
    expect(getColorMatch(profile, 'not-a-real-color')).toBeNull();
  });
});
