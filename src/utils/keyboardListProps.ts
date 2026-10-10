/**
 * Scroll props for a list that sits under a search box. Rows stay tappable
 * while the keyboard is up (otherwise the first tap only closes it), the list
 * can be scrolled clear of the keyboard, and dragging it closes the keyboard.
 */

import { Platform } from 'react-native';

export const keyboardListProps = {
  keyboardShouldPersistTaps: 'handled' as const,
  keyboardDismissMode: (Platform.OS === 'ios' ? 'interactive' : 'on-drag') as 'interactive' | 'on-drag',
  automaticallyAdjustKeyboardInsets: true,
};
