/**
 * Sheet — bottom sheet modal. Lightweight wrapper over RN Modal with a
 * backdrop, rounded top corners, and a drag-handle affordance.
 */

import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from './Text';
import { useTheme } from '../styles/ThemeProvider';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export const Sheet: React.FC<SheetProps> = ({ visible, onClose, title, children }) => {
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={e => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderTopLeftRadius: theme.radius['2xl'],
              borderTopRightRadius: theme.radius['2xl'],
            },
          ]}
        >
          <View
            style={[
              styles.handle,
              { backgroundColor: theme.colors.borderStrong },
            ]}
          />
          {title ? (
            <Text variant="h3" style={{ marginTop: 6, marginBottom: 12 }}>
              {title}
            </Text>
          ) : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
});

export default Sheet;
