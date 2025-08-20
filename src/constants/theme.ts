export const COLORS = {
  primary: '#2196F3', // Blue for header
  secondary: '#FFC107',
  background: '#F5F5F5',
  surface: '#FFFFFF',
  text: '#333333',
  textSecondary: '#666666',
  error: '#F44336',
  success: '#4CAF50',
  warning: '#FF9800',
  disabled: '#CCCCCC',
  border: '#E0E0E0',
  placeholder: '#999999',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const TYPOGRAPHY = {
  fontSizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 24,
  },
  fontWeights: {
    normal: '400',
    medium: '500',
    semiBold: '600',
    bold: '700',
  },
  lineHeights: {
    tight: 12,
    normal: 14,
    relaxed: 16,
  },
} as const;

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.23,
    shadowRadius: 2.62,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
} as const;

export const HEADER_HEIGHT = 60;
export const BOTTOM_SAFE_AREA = 34; // For phones with home indicator

export const theme = {
  colors: COLORS,
  spacing: SPACING,
  typography: TYPOGRAPHY,
  borderRadius: BORDER_RADIUS,
  shadows: SHADOWS,
  headerHeight: HEADER_HEIGHT,
  bottomSafeArea: BOTTOM_SAFE_AREA,
} as const;

export type Theme = typeof theme;
