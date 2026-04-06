/**
 * Web shim for react-native-reanimated.
 * Provides no-op stubs so navigation and tabs don't crash.
 */

import { View } from 'react-native';

export const useSharedValue = (init: any) => ({ value: init });
export const useAnimatedStyle = (fn: () => any) => fn();
export const useDerivedValue = (fn: () => any) => ({ value: fn() });
export const withTiming = (value: any) => value;
export const withSpring = (value: any) => value;
export const withDelay = (_delay: number, value: any) => value;
export const runOnJS = (fn: any) => fn;
export const runOnUI = (fn: any) => fn;
export const cancelAnimation = () => {};
export const interpolate = (val: number, input: number[], output: number[]) => {
  if (input.length < 2 || output.length < 2) return output[0] ?? val;
  const ratio = (val - input[0]) / (input[1] - input[0]);
  return output[0] + ratio * (output[1] - output[0]);
};

export const Easing = {
  linear: (t: number) => t,
  ease: (t: number) => t,
  in: (t: number) => t,
  out: (t: number) => t,
  inOut: (t: number) => t,
  bezier: () => (t: number) => t,
};

export const FadeIn = { duration: () => FadeIn };
export const FadeOut = { duration: () => FadeOut };
export const SlideInRight = { duration: () => SlideInRight };
export const SlideOutLeft = { duration: () => SlideOutLeft };

// Animated components — just re-export the plain RN View
const createAnimatedComponent = (Component: any) => Component;

const Animated = {
  View,
  Text: View,
  ScrollView: View,
  Image: View,
  FlatList: View,
  createAnimatedComponent,
};

export default Animated;
