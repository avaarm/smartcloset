/**
 * Legacy theme module.
 *
 * Historically screens imported a static `theme` object from here. We keep that
 * shape for backward compatibility — the 40+ screens using
 * `import theme from '../styles/theme'` continue to work, they just get the
 * new design tokens from `./tokens`.
 *
 * New code should use `useTheme()` from `./ThemeProvider` instead, which gives
 * reactive light/dark support.
 */

import { lightTheme } from './tokens';

export const theme = lightTheme;
export default theme;

// Also re-export the helpers so new code can pull everything from one place.
export {
  buildTheme,
  lightTheme,
  darkTheme,
  lightPalette,
  darkPalette,
  typography,
  spacing,
  radius,
  shadows,
  animation,
  type Theme,
} from './tokens';
export { ThemeProvider, useTheme } from './ThemeProvider';
