/**
 * One photo of an item. If its address cannot be loaded (a dead shop link, a deleted file, an expired
 * signature) it shows a placeholder in its place, so one bad photo never blanks the page it sits on.
 * The failure is forgotten when the address changes.
 */
import React, { useEffect, useState } from 'react';
import { Image, ImageResizeMode, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import theme from '../styles/theme';

type Props = {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  /** Behind the placeholder icon. */
  placeholderBackground?: string;
  iconColor?: string;
  iconSize?: number;
  /** Called with true when the photo fails to load, false when a new address is given. */
  onFailedChange?: (failed: boolean) => void;
};

const PhotoWithFallback: React.FC<Props> = ({
  uri,
  style,
  resizeMode = 'cover',
  placeholderBackground = theme.colors.mutedBackground,
  iconColor = '#C8BBA6',
  iconSize = 44,
  onFailedChange,
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    onFailedChange?.(false);
    // The callback is the parent's to keep stable or not; a new function must not clear a real failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  if (failed) {
    return (
      <View
        testID="photo-fallback"
        style={[styles.placeholder, { backgroundColor: placeholderBackground }, style as StyleProp<ViewStyle>]}
      >
        <Icon name="shirt-outline" size={iconSize} color={iconColor} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      onError={() => {
        setFailed(true);
        onFailedChange?.(true);
      }}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});

export default PhotoWithFallback;
