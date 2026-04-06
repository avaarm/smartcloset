/**
 * Skeleton — loading placeholder with a subtle shimmer animation.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../styles/ThemeProvider';

export type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius,
  style,
}) => {
  const { theme } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const bg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.skeletonBase, theme.colors.skeletonHighlight],
  });

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          backgroundColor: bg,
          borderRadius: borderRadius ?? theme.radius.sm,
        },
        style,
      ]}
    />
  );
};

export default Skeleton;
