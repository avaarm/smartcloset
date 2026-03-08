/**
 * Theme file for SmartCloset app
 * Modern luxury fashion aesthetic with sophisticated color palette
 */

export const theme = {
  colors: {
    background: '#F8F7FF', // Soft lavender white background
    cardBackground: '#FFFFFF', // Pure white for cards
    text: '#1F1B2E', // Deep purple-black for primary text
    primary: '#8B7FD9', // Vibrant purple - primary brand color
    accent: '#8B7FD9', // Vibrant purple accent
    accentDark: '#6B5FB9', // Deeper purple for hover states
    accentLight: '#A599E9', // Lighter purple for subtle accents
    textSecondary: '#6B7280', // Cool gray for secondary text
    lightGray: '#E5E7EB', // Soft gray for borders
    mediumGray: '#9CA3AF', // Medium gray for secondary text
    darkGray: '#374151', // Dark gray for emphasis
    shadowColor: '#8B7FD9',
    mutedBackground: '#F3F4F6', // Light gray for sections
    categoryTag: '#EDE9FE', // Light purple for tags
    success: '#10B981', // Modern green for success states
    warning: '#F59E0B', // Amber for warnings
    error: '#EF4444', // Modern red for errors
    info: '#3B82F6', // Blue for info
    gradient: {
      primary: ['#8B7FD9', '#A599E9'],
      secondary: ['#F3F4F6', '#F8F7FF'],
      dark: ['#6B5FB9', '#4C3F99'],
      luxury: ['#8B7FD9', '#9D8FE3', '#AFA3ED'],
      accent: ['#A599E9', '#C4B5FD'],
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
