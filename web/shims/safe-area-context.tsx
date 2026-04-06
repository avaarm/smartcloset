/**
 * Web shim for react-native-safe-area-context.
 * On web, safe areas are handled by CSS env() or are simply zero.
 */

import React from 'react';
import { View, ViewProps } from 'react-native';

const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

export const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 0, height: 0 },
  insets: ZERO_INSETS,
};

export const SafeAreaInsetsContext = React.createContext(ZERO_INSETS);
export const SafeAreaFrameContext = React.createContext({
  x: 0, y: 0,
  width: typeof window !== 'undefined' ? window.innerWidth : 375,
  height: typeof window !== 'undefined' ? window.innerHeight : 812,
});

export const SafeAreaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);

export const SafeAreaView: React.FC<ViewProps & { edges?: string[]; children?: React.ReactNode }> = ({
  children,
  style,
  ...rest
}) => (
  <View style={[{ flex: 1 }, style]} {...rest}>
    {children}
  </View>
);

export const useSafeAreaInsets = () => ZERO_INSETS;
export const useSafeAreaFrame = () => ({
  x: 0,
  y: 0,
  width: typeof window !== 'undefined' ? window.innerWidth : 375,
  height: typeof window !== 'undefined' ? window.innerHeight : 812,
});

export default { SafeAreaProvider, SafeAreaView, useSafeAreaInsets, useSafeAreaFrame };
