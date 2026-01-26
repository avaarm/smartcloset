/**
 * Theme file for SmartCloset app
 * Modern luxury fashion aesthetic with sophisticated color palette
 */

export const theme = {
  colors: {
    background: '#FAFAF9', // Warm white background
    cardBackground: '#FFFFFF', // Pure white for cards
    text: '#1A1A1A', // Rich black for primary text
    primary: '#D4A5A5', // Primary brand color (same as accent)
    accent: '#D4A5A5', // Dusty rose accent
    accentDark: '#B88B8B', // Deeper rose for hover states
    textSecondary: '#8B8B8B', // Secondary text color
    lightGray: '#E8E6E3', // Soft gray for borders
    mediumGray: '#8B8B8B', // Medium gray for secondary text
    darkGray: '#4A4A4A', // Dark gray for emphasis
    shadowColor: '#000000',
    mutedBackground: '#F5F3F0', // Warm beige for sections
    categoryTag: '#E8E6E3', // Neutral beige for tags
    success: '#7CB342', // Green for success states
    warning: '#FFA726', // Orange for warnings
    error: '#EF5350', // Red for errors
    gradient: {
      primary: ['#D4A5A5', '#E8B4B8'],
      secondary: ['#F5F3F0', '#FAFAF9'],
      dark: ['#4A4A4A', '#1A1A1A'],
      luxury: ['#C9A9A6', '#D4B5B3', '#E8C5C3'],
    },
  },
  typography: {
    fontFamily: {
      regular: 'System',
      medium: 'System',
      bold: 'System',
    },
    fontSize: {
      tiny: 10,
      small: 12,
      medium: 14,
      large: 16,
      xlarge: 20,
      xxlarge: 24,
    },
    letterSpacing: {
      tight: 0.3,
      normal: 0.5,
      wide: 1,
      extraWide: 1.5,
    },
  },
  spacing: {
    tiny: 4,
    small: 8,
    medium: 16,
    large: 24,
    xlarge: 32,
  },
  shadows: {
    small: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    medium: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 4,
    },
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    subtle: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
  },
  borderRadius: {
    small: 8,
    medium: 12,
    large: 16,
  },
  animation: {
    duration: {
      fast: 200,
      normal: 300,
      slow: 500,
    },
  },
};

export default theme;
