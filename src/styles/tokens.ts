/**
 * Design tokens — the source of truth for all visual styling.
 *
 * Inspired by the 21st.dev aesthetic: clean sans-serif (Inter), near-white
 * neutral backgrounds with a single accent, generous spacing, subtle shadows,
 * 2px borders, rounded-2xl cards, dark-mode first class.
 *
 * Every color / size / spacing used in the app should come from here.
 * Screens get the resolved palette via `useTheme()` from `ThemeProvider`.
 */

// =============================================================================
// Spacing — 4pt grid
// =============================================================================
export const spacing = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,

  // Semantic aliases used by legacy screens
  tiny: 4,
  small: 8,
  medium: 16,
  large: 24,
  xlarge: 32,
} as const;

// =============================================================================
// Typography
// =============================================================================
// NOTE on fonts: we intentionally use the system font (SF Pro on iOS, Roboto on
// Android) rather than bundling Inter. Bundling TTFs requires native linking
// on both platforms and is a build-break risk. The system fonts look clean
// enough that the aesthetic holds. If we want Inter later, drop TTFs into
// src/assets/fonts/ and run `npx react-native-asset`.
export const typography = {
  fontFamily: {
    regular: 'System',
    medium: 'System',
    semibold: 'System',
    bold: 'System',
  },
  fontSize: {
    xs: 11,
    sm: 12,
    base: 14,
    md: 15,
    lg: 16,
    xl: 18,
    '2xl': 22,
    '3xl': 28,
    '4xl': 36,
    '5xl': 48,

    // Legacy aliases
    tiny: 11,
    small: 12,
    medium: 14,
    large: 16,
    xlarge: 20,
    xxlarge: 28,
  },
  lineHeight: {
    tight: 1.15,
    snug: 1.3,
    normal: 1.45,
    relaxed: 1.6,
  },
  letterSpacing: {
    tighter: -0.6,
    tight: -0.3,
    normal: 0,
    wide: 0.3,
    wider: 0.6,
    widest: 1.2,

    // Legacy
    extraWide: 1.5,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

// =============================================================================
// Radii
// =============================================================================
export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  full: 9999,

  // Legacy aliases
  small: 8,
  medium: 12,
  large: 16,
} as const;

// =============================================================================
// Elevation / shadows
// =============================================================================
export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  small: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  medium: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  large: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

// =============================================================================
// Animation
// =============================================================================
export const animation = {
  duration: {
    instant: 100,
    fast: 180,
    normal: 260,
    slow: 420,
  },
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    decelerate: [0, 0, 0, 1] as const,
    accelerate: [0.4, 0, 1, 1] as const,
  },
} as const;

// =============================================================================
// Color palettes — light + dark
// =============================================================================

type ColorPalette = {
  // Backgrounds
  background: string;      // main app background
  surface: string;         // cards, inputs
  surfaceElevated: string; // modals, sheets
  muted: string;           // subtle section backgrounds

  // Text
  text: string;            // primary text
  textMuted: string;       // secondary text
  textSubtle: string;      // tertiary / hints
  textInverse: string;     // on-accent text

  // Borders
  border: string;
  borderStrong: string;
  focusRing: string;

  // Accent (brand)
  accent: string;
  accentHover: string;
  accentSubtle: string;    // tinted background
  accentText: string;      // text on accent

  // Status
  success: string;
  successSubtle: string;
  warning: string;
  warningSubtle: string;
  danger: string;
  dangerSubtle: string;
  info: string;
  infoSubtle: string;

  // Skeleton / loading
  skeletonBase: string;
  skeletonHighlight: string;

  // Legacy aliases (so existing theme.ts consumers don't break)
  primary: string;
  accentDark: string;
  accentLight: string;
  textSecondary: string;
  lightGray: string;
  mediumGray: string;
  darkGray: string;
  cardBackground: string;
  mutedBackground: string;
  shadowColor: string;
  categoryTag: string;
  error: string;
};

export const lightPalette: ColorPalette = {
  background: '#FAFAF9',         // warm off-white
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  muted: '#F5F5F4',

  text: '#0C0A09',
  textMuted: '#57534E',
  textSubtle: '#A8A29E',
  textInverse: '#FAFAF9',

  border: '#E7E5E4',
  borderStrong: '#D6D3D1',
  focusRing: '#0C0A09',

  accent: '#0C0A09',             // near-black accent à la 21st.dev
  accentHover: '#1C1917',
  accentSubtle: '#F5F5F4',
  accentText: '#FAFAF9',

  success: '#16A34A',
  successSubtle: '#DCFCE7',
  warning: '#D97706',
  warningSubtle: '#FEF3C7',
  danger: '#DC2626',
  dangerSubtle: '#FEE2E2',
  info: '#2563EB',
  infoSubtle: '#DBEAFE',

  skeletonBase: '#F5F5F4',
  skeletonHighlight: '#EAE8E6',

  // Legacy aliases
  primary: '#0C0A09',
  accentDark: '#1C1917',
  accentLight: '#44403C',
  textSecondary: '#57534E',
  lightGray: '#E7E5E4',
  mediumGray: '#A8A29E',
  darkGray: '#44403C',
  cardBackground: '#FFFFFF',
  mutedBackground: '#F5F5F4',
  shadowColor: '#0F172A',
  categoryTag: '#F5F5F4',
  error: '#DC2626',
};

export const darkPalette: ColorPalette = {
  background: '#0C0A09',
  surface: '#1C1917',
  surfaceElevated: '#292524',
  muted: '#1C1917',

  text: '#FAFAF9',
  textMuted: '#A8A29E',
  textSubtle: '#78716C',
  textInverse: '#0C0A09',

  border: '#292524',
  borderStrong: '#44403C',
  focusRing: '#FAFAF9',

  accent: '#FAFAF9',
  accentHover: '#E7E5E4',
  accentSubtle: '#1C1917',
  accentText: '#0C0A09',

  success: '#22C55E',
  successSubtle: 'rgba(34,197,94,0.15)',
  warning: '#F59E0B',
  warningSubtle: 'rgba(245,158,11,0.15)',
  danger: '#EF4444',
  dangerSubtle: 'rgba(239,68,68,0.15)',
  info: '#3B82F6',
  infoSubtle: 'rgba(59,130,246,0.15)',

  skeletonBase: '#1C1917',
  skeletonHighlight: '#292524',

  // Legacy aliases
  primary: '#FAFAF9',
  accentDark: '#E7E5E4',
  accentLight: '#A8A29E',
  textSecondary: '#A8A29E',
  lightGray: '#292524',
  mediumGray: '#78716C',
  darkGray: '#A8A29E',
  cardBackground: '#1C1917',
  mutedBackground: '#1C1917',
  shadowColor: '#000000',
  categoryTag: '#1C1917',
  error: '#EF4444',
};

// Gradients (used by legacy screens that call `theme.colors.gradient.primary`)
// Since the new aesthetic is mostly flat, gradients degrade to 2-step monochrome
// that still satisfies the legacy API shape.
const buildGradients = (p: ColorPalette) => ({
  primary: [p.accent, p.accentHover],
  secondary: [p.surface, p.muted],
  dark: [p.text, p.textMuted],
  luxury: [p.accent, p.accentHover, p.accentHover],
  accent: [p.accent, p.accentHover],
});

export type Theme = {
  colorScheme: 'light' | 'dark';
  colors: ColorPalette & { gradient: ReturnType<typeof buildGradients> };
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  borderRadius: typeof radius; // legacy alias used by existing screens
  shadows: typeof shadows;
  animation: typeof animation;
};

export const buildTheme = (scheme: 'light' | 'dark'): Theme => {
  const palette = scheme === 'dark' ? darkPalette : lightPalette;
  return {
    colorScheme: scheme,
    colors: {
      ...palette,
      gradient: buildGradients(palette),
    },
    typography,
    spacing,
    radius,
    borderRadius: radius,
    shadows,
    animation,
  };
};

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');
