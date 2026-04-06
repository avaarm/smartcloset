/**
 * styleRulesEngine — classical color theory + body-type fit rules.
 *
 * All rules are pure data + pure functions. No API calls. This module is the
 * "knowledge" that turns a (skinTone, undertone, bodyType) triple into a
 * concrete set of recommended colors and fits.
 *
 * Consumed by bodyAnalysisService and by outfitService's smart-suggestion path.
 */

import type { BodyProfile, BodyType, SkinTone, Undertone } from './profileService';

// ============================================================================
// Color palettes per undertone
// ============================================================================

export const COLOR_PALETTES: Record<
  Undertone,
  { name: string; recommend: string[]; avoid: string[] }
> = {
  cool: {
    name: 'Cool',
    // Jewel tones, crisp whites, icy pastels, blue-based reds
    recommend: [
      '#0F172A', // midnight navy
      '#1E40AF', // sapphire
      '#7C3AED', // amethyst
      '#BE185D', // berry
      '#065F46', // emerald
      '#0E7490', // teal
      '#F8FAFC', // crisp white
      '#CBD5E1', // cool gray
      '#FCE7F3', // icy pink
      '#DBEAFE', // icy blue
    ],
    avoid: [
      '#EAB308', // marigold yellow
      '#F97316', // pumpkin orange
      '#B45309', // rust
      '#CA8A04', // gold
      '#A16207', // olive
    ],
  },
  warm: {
    name: 'Warm',
    // Earthy, rich, golden tones
    recommend: [
      '#9A3412', // burnt orange
      '#B45309', // camel
      '#CA8A04', // gold
      '#7C2D12', // cinnamon
      '#65A30D', // olive
      '#166534', // forest green
      '#FEF3C7', // cream
      '#FEE2D8', // peach
      '#B91C1C', // tomato red
      '#92400E', // tobacco
    ],
    avoid: [
      '#F8FAFC', // stark white (prefer cream)
      '#1E40AF', // cold royal blue
      '#7C3AED', // cool purple
      '#BE185D', // berry
      '#0E7490', // icy teal
    ],
  },
  neutral: {
    name: 'Neutral',
    // Both cool and warm work — mid-saturation, balanced
    recommend: [
      '#57534E', // stone
      '#B91C1C', // true red
      '#065F46', // emerald
      '#0F172A', // navy
      '#A855F7', // lavender
      '#EAB308', // mustard
      '#FECACA', // blush
      '#DBEAFE', // sky
      '#FDE68A', // butter
      '#F5F5F4', // off-white
    ],
    avoid: [
      // Neutrals can wear almost anything — only extreme neon clashes
      '#FACC15', // pure neon yellow
      '#F97316', // pure neon orange
    ],
  },
};

// ============================================================================
// Body type fit rules
// ============================================================================

export const BODY_TYPE_FITS: Record<
  BodyType,
  {
    label: string;
    description: string;
    tops: string[];
    bottoms: string[];
    dresses: string[];
    tips: string[];
  }
> = {
  hourglass: {
    label: 'Hourglass',
    description: 'Balanced shoulders and hips with a defined waist.',
    tops: ['Fitted', 'Wrap', 'V-neck', 'Scoop neck', 'Belted'],
    bottoms: ['High-waisted', 'Pencil skirt', 'Straight-leg', 'Bootcut jeans'],
    dresses: ['Wrap', 'Sheath', 'Belted A-line', 'Bodycon'],
    tips: [
      'Accentuate the waist with belts or fitted cuts',
      'Avoid boxy or shapeless silhouettes',
      'High-waisted bottoms highlight your curves',
    ],
  },
  pear: {
    label: 'Pear',
    description: 'Hips wider than shoulders.',
    tops: ['Boat neck', 'Off-shoulder', 'Structured shoulders', 'Statement sleeves'],
    bottoms: ['Dark straight-leg', 'Bootcut', 'A-line skirt', 'Wide-leg'],
    dresses: ['Fit & flare', 'A-line', 'Empire waist'],
    tips: [
      'Draw attention upward with interesting necklines',
      'Darker colors on the bottom half slim the silhouette',
      'Structured shoulders balance wider hips',
    ],
  },
  apple: {
    label: 'Apple',
    description: 'Fuller midsection, slimmer legs.',
    tops: ['V-neck', 'Empire waist', 'Flowing', 'Long tunic', 'Wrap'],
    bottoms: ['Straight-leg', 'Bootcut', 'Dark wash jeans'],
    dresses: ['Empire', 'Shift', 'Wrap', 'A-line'],
    tips: [
      'V-necks elongate and create vertical lines',
      'Show off your legs — they are your best asset',
      'Avoid tight waistbands; opt for flowy fabrics through the middle',
    ],
  },
  rectangle: {
    label: 'Rectangle',
    description: 'Shoulders, waist, and hips roughly in line.',
    tops: ['Peplum', 'Ruched', 'Ruffle detail', 'Crop', 'Layered'],
    bottoms: ['Skinny', 'Wide-leg', 'Pleated skirt', 'Flare'],
    dresses: ['Belted', 'Ruched', 'Peplum', 'Wrap'],
    tips: [
      'Create curves with belts and peplum details',
      'Layering adds dimension',
      'Experiment with different silhouettes — you have flexibility',
    ],
  },
  'inverted-triangle': {
    label: 'Inverted Triangle',
    description: 'Broader shoulders, narrower hips.',
    tops: ['Soft, draped', 'V-neck', 'Scoop', 'Vertical details', 'Dark tops'],
    bottoms: ['Wide-leg', 'Flare', 'Printed', 'Light wash jeans', 'Full skirt'],
    dresses: ['A-line', 'Fit & flare', 'Flared hemline'],
    tips: [
      'Add volume to the lower half to balance shoulders',
      'Avoid shoulder pads and puff sleeves',
      'V-necks draw the eye down',
    ],
  },
};

// ============================================================================
// Size hint mapping
// ============================================================================

const SIZE_HINTS_BY_SELF_SIZE = {
  XS: { tops: 'XS', bottoms: '24', shoes: '6' },
  S: { tops: 'S', bottoms: '26', shoes: '7' },
  M: { tops: 'M', bottoms: '28', shoes: '8' },
  L: { tops: 'L', bottoms: '30', shoes: '9' },
  XL: { tops: 'XL', bottoms: '32', shoes: '10' },
  XXL: { tops: 'XXL', bottoms: '34', shoes: '11' },
} as const;

export type SelfReportedSize = keyof typeof SIZE_HINTS_BY_SELF_SIZE;

// ============================================================================
// Public API
// ============================================================================

/**
 * Build a full BodyProfile from the minimum inputs.
 * The palette + fit rules are derived from the undertone + body type.
 */
export const buildBodyProfile = (input: {
  skinTone: SkinTone;
  undertone: Undertone;
  bodyType: BodyType;
  size?: SelfReportedSize;
  facePhotoUri?: string;
}): BodyProfile => {
  const palette = COLOR_PALETTES[input.undertone];
  const fit = BODY_TYPE_FITS[input.bodyType];
  const sizeHints = input.size ? SIZE_HINTS_BY_SELF_SIZE[input.size] : {};

  return {
    skinTone: input.skinTone,
    undertone: input.undertone,
    bodyType: input.bodyType,
    recommendedPalette: palette.recommend,
    avoidColors: palette.avoid,
    recommendedFits: {
      tops: fit.tops,
      bottoms: fit.bottoms,
      dresses: fit.dresses,
    },
    sizeHints,
    updatedAt: new Date().toISOString(),
    facePhotoUri: input.facePhotoUri,
  };
};

/**
 * Given a recommended palette and a hex color, return a match score in [0, 1].
 * 1 = exact or very close; 0 = not in palette at all. Uses simple RGB distance.
 */
export const paletteMatchScore = (palette: string[], hex: string): number => {
  const target = hexToRgb(hex);
  if (!target) return 0;
  let best = Infinity;
  for (const p of palette) {
    const c = hexToRgb(p);
    if (!c) continue;
    const d = Math.sqrt(
      (c.r - target.r) ** 2 + (c.g - target.g) ** 2 + (c.b - target.b) ** 2,
    );
    if (d < best) best = d;
  }
  // RGB distance max is ~441; normalize to [0, 1]
  return Math.max(0, 1 - best / 441);
};

/**
 * Decide whether a clothing item's dominant color is "in-palette" for a profile.
 */
export const isColorOnProfile = (profile: BodyProfile, hex: string): boolean => {
  const recScore = paletteMatchScore(profile.recommendedPalette, hex);
  const avoidScore = paletteMatchScore(profile.avoidColors, hex);
  return recScore > avoidScore && recScore > 0.5;
};

/**
 * Map a common color name (e.g. 'red', 'navy', 'cream') to an approximate hex.
 * Used when items only have named colors rather than actual hex values.
 */
export const colorNameToHex = (name?: string): string | null => {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  const map: Record<string, string> = {
    black: '#000000', white: '#FFFFFF', gray: '#6B7280', grey: '#6B7280',
    'dark gray': '#374151', 'light gray': '#D1D5DB', silver: '#9CA3AF',
    red: '#DC2626', 'dark red': '#7F1D1D', crimson: '#BE123C', burgundy: '#7F1D1D',
    pink: '#EC4899', 'hot pink': '#E11D48', blush: '#FECACA', rose: '#F43F5E',
    orange: '#F97316', 'burnt orange': '#9A3412', peach: '#FDBA74',
    yellow: '#EAB308', mustard: '#CA8A04', gold: '#CA8A04', cream: '#FEF3C7',
    green: '#16A34A', 'dark green': '#14532D', olive: '#65A30D', forest: '#166534',
    'forest green': '#166534', emerald: '#047857', mint: '#6EE7B7',
    teal: '#0E7490', cyan: '#06B6D4', turquoise: '#14B8A6', aqua: '#22D3EE',
    blue: '#2563EB', 'dark blue': '#1E3A8A', navy: '#0F172A', royal: '#1E40AF',
    sky: '#0EA5E9', 'light blue': '#BFDBFE', powder: '#DBEAFE',
    purple: '#7C3AED', violet: '#8B5CF6', lavender: '#C4B5FD', amethyst: '#7C3AED',
    brown: '#78350F', tan: '#B45309', beige: '#E7E5E4', camel: '#B45309',
    khaki: '#A16207', rust: '#9A3412', chocolate: '#78350F',
    multicolor: '#9CA3AF',
  };
  return map[n] ?? null;
};

// ============================================================================
// Helpers
// ============================================================================

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1]!, 16);
  return {
    r: (int >> 16) & 0xff,
    g: (int >> 8) & 0xff,
    b: int & 0xff,
  };
};

/**
 * Classify an RGB triple into a (SkinTone, Undertone) pair.
 * Simple heuristic: luminance determines tone family; red/blue balance
 * determines undertone.
 */
export const classifySkinRgb = (rgb: { r: number; g: number; b: number }): {
  skinTone: SkinTone;
  undertone: Undertone;
} => {
  const { r, g, b } = rgb;
  // Relative luminance (ITU-R BT.709)
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  let skinTone: SkinTone;
  if (L > 210) skinTone = 'fair';
  else if (L > 180) skinTone = 'light';
  else if (L > 150) skinTone = 'medium';
  else if (L > 115) skinTone = 'tan';
  else if (L > 75) skinTone = 'deep';
  else skinTone = 'rich';

  // Undertone: compare red vs blue. Red-dominant = warm, blue-dominant = cool,
  // balanced = neutral. Small tolerance zone so most faces don't get extremes.
  const rb = r - b;
  let undertone: Undertone;
  if (rb > 20) undertone = 'warm';
  else if (rb < -8) undertone = 'cool';
  else undertone = 'neutral';

  return { skinTone, undertone };
};
