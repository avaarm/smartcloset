/**
 * Clothing colour names and perceptual colour matching.
 *
 * Naming an RGB value by walking if-chains put the first rule that fit ahead of
 * the closest one, so tan suede came out "ivory" and dark greys came out
 * "green". Here every colour is compared in CIELAB, where distance tracks how
 * different two colours look, and the nearest named clothing colour wins.
 */

import { tokenize } from './wordMatch';

export interface PaletteColor {
  name: string;
  /** Typical sRGB value for the name as it looks on fabric, not the CSS keyword. */
  hex: string;
}

/** What an item that is several colours at once is called. */
export const MULTICOLOR = 'multicolor';

export const CLOTHING_COLORS: readonly PaletteColor[] = [
  // Neutrals
  { name: 'white', hex: '#FFFFFF' },
  { name: 'ivory', hex: '#F4EFE0' },
  { name: 'cream', hex: '#F0E4C8' },
  { name: 'beige', hex: '#D9C7A9' },
  { name: 'tan', hex: '#C9A57B' },
  { name: 'camel', hex: '#B98B55' },
  { name: 'khaki', hex: '#B8AA86' },
  { name: 'taupe', hex: '#9A8A7C' },
  { name: 'brown', hex: '#7A4E2D' },
  { name: 'dark brown', hex: '#4A2E1D' },
  { name: 'light gray', hex: '#D3D3D5' },
  { name: 'gray', hex: '#8E8E8E' },
  { name: 'silver', hex: '#B4B4B8' },
  { name: 'charcoal', hex: '#3E3F44' },
  { name: 'black', hex: '#141414' },
  // Reds and pinks
  { name: 'red', hex: '#C41E2D' },
  { name: 'burgundy', hex: '#6D1F32' },
  { name: 'maroon', hex: '#7A2323' },
  { name: 'rust', hex: '#B5481F' },
  { name: 'terracotta', hex: '#C86B4E' },
  { name: 'coral', hex: '#EF7F68' },
  { name: 'pink', hex: '#F2A3B8' },
  { name: 'blush', hex: '#F3CFC9' },
  { name: 'hot pink', hex: '#E0457B' },
  // Oranges and yellows
  { name: 'orange', hex: '#E8731A' },
  { name: 'peach', hex: '#F6C7A1' },
  { name: 'mustard', hex: '#CFA11C' },
  { name: 'yellow', hex: '#F3D43D' },
  { name: 'gold', hex: '#D8B24A' },
  // Greens
  { name: 'olive', hex: '#6B6B2F' },
  { name: 'sage', hex: '#9CAF88' },
  { name: 'green', hex: '#2F8F4E' },
  { name: 'forest green', hex: '#22492F' },
  { name: 'lime', hex: '#9BCB3B' },
  { name: 'mint', hex: '#A9DFC0' },
  { name: 'teal', hex: '#1F7A7A' },
  { name: 'turquoise', hex: '#3FC1C0' },
  // Blues
  { name: 'navy', hex: '#1B2A4A' },
  { name: 'blue', hex: '#2F5FB0' },
  { name: 'light blue', hex: '#A9CBEA' },
  // Purples
  { name: 'purple', hex: '#6A3A8E' },
  { name: 'lavender', hex: '#C9B8E4' },
  { name: 'plum', hex: '#5E2A58' },
  { name: 'mauve', hex: '#B28DA6' },
];

// ─── RGB / hex / Lab ─────────────────────────────────────────────────────────

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

type Lab = readonly [number, number, number];

export const hexToRgb = (hex: string): Rgb | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
};

export const rgbToHex = ({ r, g, b }: Rgb): string => {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
};

const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const rgbToLab = ({ r, g, b }: Rgb): Lab => {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  // D65 white point
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const labDistance = (a: Lab, b: Lab): number =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

const PALETTE_LAB = new Map<string, Lab>(
  CLOTHING_COLORS.map(c => [c.name, rgbToLab(hexToRgb(c.hex) as Rgb)] as [string, Lab]),
);

/** Perceptual distance between two RGB colours (~2 is barely noticeable, ~20+ is clearly different). */
export const rgbDistance = (a: Rgb, b: Rgb): number => labDistance(rgbToLab(a), rgbToLab(b));

/** Perceptual distance between two palette names; Infinity when either isn't one. */
export const nameDistance = (a: string, b: string): number => {
  const la = PALETTE_LAB.get(a);
  const lb = PALETTE_LAB.get(b);
  return la && lb ? labDistance(la, lb) : Infinity;
};

/** Perceptual distance from an RGB value to a palette colour; Infinity for an unknown name. */
export const distanceToName = (rgb: Rgb, name: string): number => {
  const lab = PALETTE_LAB.get(name);
  return lab ? labDistance(rgbToLab(rgb), lab) : Infinity;
};

export const hexForColorName = (name: string): string | undefined =>
  CLOTHING_COLORS.find(c => c.name === name)?.hex;

/** The clothing colour that looks closest to this RGB value. */
export const nameForRgb = (rgb: Rgb): string => {
  const lab = rgbToLab(rgb);
  let best = CLOTHING_COLORS[0].name;
  let bestDist = Infinity;
  for (const c of CLOTHING_COLORS) {
    const d = labDistance(lab, PALETTE_LAB.get(c.name) as Lab);
    if (d < bestDist) {
      bestDist = d;
      best = c.name;
    }
  }
  return best;
};

/**
 * True for the dark-to-mid red-brown of stained wood (floors, tables). Lighter
 * warm tones - tan, camel, beige - are deliberately outside it, so a suede boot
 * is not mistaken for the floor it stands on.
 */
export const isWoodTone = ({ r, g, b }: Rgb): boolean => {
  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return false;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === r / 255) h = ((g - b) / 255 / d) % 6;
  else if (mx === g / 255) h = (b - r) / 255 / d + 2;
  else h = (r - g) / 255 / d + 4;
  h = (h * 60 + 360) % 360;
  return h <= 36 && s >= 0.3 && l >= 0.12 && l <= 0.56;
};

// ─── Names from text ─────────────────────────────────────────────────────────

const PALETTE_NAMES = new Set(CLOTHING_COLORS.map(c => c.name));

// Words people and models use for clothing colours that aren't palette names.
const ALIASES: Record<string, string> = {
  grey: 'gray', 'light grey': 'light gray', 'dark gray': 'charcoal', 'dark grey': 'charcoal',
  slate: 'charcoal', graphite: 'charcoal', gunmetal: 'charcoal', ash: 'gray',
  'off white': 'ivory', offwhite: 'ivory', eggshell: 'ivory', bone: 'ivory', pearl: 'ivory',
  ecru: 'cream', vanilla: 'cream', champagne: 'beige', oatmeal: 'beige', oat: 'beige', sand: 'beige', nude: 'beige',
  stone: 'taupe', mushroom: 'taupe', greige: 'taupe',
  'light brown': 'tan', chocolate: 'dark brown', espresso: 'dark brown', 'chocolate brown': 'dark brown',
  cognac: 'brown', coffee: 'brown', mocha: 'brown', chestnut: 'brown', walnut: 'brown', caramel: 'camel',
  natural: 'beige', neutral: 'beige', tortoise: 'brown', tortoiseshell: 'brown',
  'dark red': 'burgundy', wine: 'burgundy', oxblood: 'burgundy', bordeaux: 'burgundy', merlot: 'burgundy',
  cherry: 'red', scarlet: 'red', crimson: 'red', ruby: 'red',
  'burnt orange': 'rust', cinnamon: 'rust', copper: 'rust', 'dark orange': 'rust',
  salmon: 'coral', apricot: 'peach',
  rose: 'pink', 'light pink': 'blush', 'dusty rose': 'blush', fuchsia: 'hot pink', magenta: 'hot pink',
  lemon: 'yellow', golden: 'gold', bronze: 'gold', brass: 'gold', 'rose gold': 'gold',
  'army green': 'olive', 'military green': 'olive', 'olive green': 'olive', moss: 'olive',
  'sage green': 'sage', 'mint green': 'mint', seafoam: 'mint', 'light green': 'mint',
  emerald: 'green', jade: 'green', 'kelly green': 'green', 'dark green': 'forest green', 'hunter green': 'forest green',
  aqua: 'turquoise', cyan: 'turquoise',
  'navy blue': 'navy', 'dark blue': 'navy', indigo: 'navy', midnight: 'navy',
  'sky blue': 'light blue', 'baby blue': 'light blue', 'powder blue': 'light blue', 'pale blue': 'light blue',
  cobalt: 'blue', 'royal blue': 'blue', denim: 'blue',
  violet: 'purple', 'dark purple': 'plum', 'light purple': 'lavender', lilac: 'lavender',
  eggplant: 'plum', aubergine: 'plum',
  multi: MULTICOLOR, multicolor: MULTICOLOR, multicolour: MULTICOLOR, multicolored: MULTICOLOR,
  multicoloured: MULTICOLOR, 'multi color': MULTICOLOR, 'multi colored': MULTICOLOR, 'multi colour': MULTICOLOR,
  rainbow: MULTICOLOR, colorful: MULTICOLOR, colourful: MULTICOLOR, assorted: MULTICOLOR,
};

const lookup = (phrase: string): string | null => {
  if (PALETTE_NAMES.has(phrase)) return phrase;
  return ALIASES[phrase] ?? null;
};

/** The longest run of words that is a colour name, earliest first: "rich dark brown leather" -> "dark brown". */
const findColorPhrase = (words: string[]): string | null => {
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const hit = lookup(words.slice(i, i + n).join(' '));
      if (hit) return hit;
    }
  }
  return null;
};

/**
 * Turn whatever a model wrote for a colour ("Dark Brown", "olive_green",
 * "tan/black", "#C9A98A") into one of our colour names, or MULTICOLOR, or null
 * when it is not a colour we can place. When several colours are named the
 * first one wins ("tan leather with black trim" is tan).
 */
export const normalizeColorName = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  const raw = input.trim().toLowerCase();
  if (!raw || raw.length > 40) return null;

  const rgb = /^#[0-9a-f]{6}$/.test(raw) ? hexToRgb(raw) : null;
  if (rgb) return nameForRgb(rgb);

  // "tan/black", "black and white" -> the first colour named.
  const first = raw.split(/\s*(?:\/|,|&|\+|\band\b)\s*/)[0];
  const words = tokenize(first);
  return words.length === 0 ? null : findColorPhrase(words);
};
