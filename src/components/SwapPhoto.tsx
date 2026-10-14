/**
 * SwapPhoto — a photo from the private swap-photos bucket. It asks for a temporary link
 * (kept in memory only), shows a placeholder while it loads or when there is no photo, and,
 * if the link has expired by the time the image loads, asks for a fresh one once.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../styles/ThemeProvider';
import { forgetSwapPhoto, signSwapPhotos } from '../services/swapPhotoUrls';

export type SwapPhotoProps = {
  /** Path inside swap-photos, e.g. "<listing id>.jpg". Null or empty shows the placeholder. */
  path?: string | null;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

export const SwapPhoto: React.FC<SwapPhotoProps> = ({ path, style, accessibilityLabel }) => {
  const { theme } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const refreshed = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    refreshed.current = false;
    setBroken(false);
    setUri(null);
    if (!path) return;
    signSwapPhotos([path]).then(m => {
      if (alive.current) setUri(m.get(path) ?? null);
    });
  }, [path]);

  const onError = () => {
    if (!path) return;
    if (refreshed.current) {
      setBroken(true);
      return;
    }
    refreshed.current = true;
    forgetSwapPhoto(path);
    signSwapPhotos([path]).then(m => {
      if (!alive.current) return;
      const next = m.get(path) ?? null;
      if (next && next !== uri) setUri(next);
      else setBroken(true);
    });
  };

  if (!path || !uri || broken) {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        style={[styles.placeholder, { backgroundColor: theme.colors.muted }, style as any]}
      >
        <Icon name="shirt-outline" size={28} color={theme.colors.textSubtle} />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode="cover" accessibilityLabel={accessibilityLabel} onError={onError} />;
};

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});

export default SwapPhoto;
