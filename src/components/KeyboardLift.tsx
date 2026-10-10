/**
 * KeyboardLift — keeps the content of a bottom sheet above the keyboard.
 *
 * KeyboardAvoidingView works out how far the keyboard overlaps it from its
 * position inside its parent, so in a sheet that is only as tall as its content
 * and sits at the bottom of a modal it never sees an overlap and does nothing.
 * Padding the content by the keyboard's height grows the sheet upward instead.
 * Android resizes the window for the keyboard itself, so only iOS needs this.
 */

import React, { useEffect, useState } from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform, View, ViewProps } from 'react-native';

/** How much of the screen the keyboard covers right now (0 when it is closed). */
export const useKeyboardHeight = (): number => {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const sub = Keyboard.addListener('keyboardWillChangeFrame', e => {
      const covered = Math.max(Dimensions.get('window').height - e.endCoordinates.screenY, 0);
      if (e.duration > 0) {
        LayoutAnimation.configureNext({
          duration: e.duration,
          update: { duration: e.duration, type: 'keyboard' },
        });
      }
      setHeight(covered);
    });
    return () => sub.remove();
  }, []);

  return height;
};

export const KeyboardLift: React.FC<ViewProps> = ({ style, ...rest }) => {
  const height = useKeyboardHeight();
  return <View style={[style, { paddingBottom: height }]} {...rest} />;
};

export default KeyboardLift;
