/**
 * Photo analysis names colours from its own palette ("ivory", "taupe",
 * "dark brown"). The body-profile colour match must understand all of them,
 * or an item the app just recognised shows no match for the user's palette.
 */
import { getColorMatch } from '../../src/components/clothingColorMatch';
import { colorNameToHex } from '../../src/services/styleRulesEngine';
import { CLOTHING_COLORS, MULTICOLOR, hexForColorName } from '../../src/utils/colorNames';
import type { BodyProfile } from '../../src/services/profileService';

const profile = (recommendedPalette: string[], avoidColors: string[]): BodyProfile => ({
  skinTone: 'medium',
  undertone: 'warm',
  bodyType: 'rectangle',
  recommendedPalette,
  avoidColors,
  recommendedFits: { tops: [], bottoms: [], dresses: [] },
  sizeHints: {},
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('colorNameToHex', () => {
  it.each(['ivory', 'taupe', 'charcoal', 'maroon', 'terracotta', 'coral', 'sage', 'plum', 'mauve', 'lime', 'dark brown'])(
    'knows "%s", a name photo analysis can produce',
    name => {
      expect(colorNameToHex(name)).toBe(hexForColorName(name));
    },
  );

  it('knows every colour name photo analysis can produce', () => {
    for (const { name } of CLOTHING_COLORS) expect(colorNameToHex(name)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(colorNameToHex(MULTICOLOR)).not.toBeNull();
  });

  it('keeps the values it already had', () => {
    expect(colorNameToHex('Navy')).toBe('#0F172A');
    expect(colorNameToHex(' black ')).toBe('#000000');
    expect(colorNameToHex('tan')).toBe('#B45309');
  });

  it('still says nothing for a name it cannot place', () => {
    expect(colorNameToHex('sparkly unicorn')).toBeNull();
    expect(colorNameToHex('')).toBeNull();
    expect(colorNameToHex(undefined)).toBeNull();
  });
});

describe('getColorMatch for a colour photo analysis just named', () => {
  it('matches an ivory item to an ivory-friendly palette and flags it against an avoid list', () => {
    expect(getColorMatch(profile(['#F4EFE0'], ['#141414']), 'ivory')).toBe('match');
    expect(getColorMatch(profile(['#141414'], ['#F4EFE0']), 'ivory')).toBe('avoid');
  });

  it('works for a two-word name', () => {
    expect(getColorMatch(profile(['#4A2E1D'], ['#FFFFFF']), 'dark brown')).toBe('match');
  });
});
