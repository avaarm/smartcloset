/**
 * Screen — standard screen shell.
 *
 * Wraps children in a themed SafeAreaView and optional ScrollView + header.
 * New screens should use this instead of re-rolling the SafeAreaView pattern.
 */

import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StatusBar,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../styles/ThemeProvider';

export type ScreenProps = {
  children: React.ReactNode;
  scrollable?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  padded?: boolean;
  backgroundColor?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  keyboardAvoiding?: boolean;
  refreshControl?: ScrollViewProps['refreshControl'];
};

export const Screen: React.FC<ScreenProps> = ({
  children,
  scrollable = false,
  header,
  footer,
  padded = true,
  backgroundColor,
  contentContainerStyle,
  style,
  keyboardAvoiding = false,
  refreshControl,
}) => {
  const { theme, colorScheme } = useTheme();
  const bg = backgroundColor ?? theme.colors.background;
  const pad = padded ? 16 : 0;

  const contentInner = (
    <>
      {header}
      {scrollable ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            { padding: pad, paddingBottom: pad + 24 },
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, padding: pad }, contentContainerStyle]}>{children}</View>
      )}
      {footer}
    </>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }, style]} edges={['top', 'left', 'right']}>
      <StatusBar
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={bg}
      />
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {contentInner}
        </KeyboardAvoidingView>
      ) : (
        contentInner
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
});

export default Screen;
