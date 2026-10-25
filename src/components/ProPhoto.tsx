/**
 * ProPhoto — the cover photo of one closet piece, in the two situations professional accounts have.
 *
 *   connectionId + itemId   a stylist looking at a client's shared piece. The image is requested from the
 *                           pro-photo function with the signed-in person's own token (proPhotoSource). The
 *                           function checks the live grant on every request and removes location and camera
 *                           data, so there is no link and no storage path anywhere in this component.
 *   ownPath                 a person looking at their own piece: the app's normal own-photo signing.
 *
 * A placeholder shows while the photo loads, when hasPhoto is false, and when it cannot be had (a grant that was
 * switched off answers 404, which looks like any other failure). After an image error it asks once more, then
 * gives up quietly. Nothing is logged, and the path is never rendered, labelled or stored.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../styles/ThemeProvider';
import { proPhotoSource, type ProPhotoSource } from '../services/proPhotoUrls';
import { signStoragePaths } from '../services/imageUrls';

export type ProPhotoProps = {
  /** With itemId: a stylist viewing a client's shared piece. */
  connectionId?: string;
  itemId?: string;
  /** A person's own piece: the path inside their wardrobe-images folder. Never shown. */
  ownPath?: string | null;
  /** False when the piece has no photo: the placeholder shows and nothing is requested. Unknown counts as true. */
  hasPhoto?: boolean;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

type Source = { uri: string; headers?: ProPhotoSource['headers'] };

export const ProPhoto: React.FC<ProPhotoProps> = ({
  connectionId,
  itemId,
  ownPath,
  hasPhoto,
  style,
  accessibilityLabel,
}) => {
  const { theme } = useTheme();
  const [source, setSource] = useState<Source | null>(null);
  const [broken, setBroken] = useState(false);
  // Changing the key makes the image view ask for the picture again; the same address alone would not.
  const [attempt, setAttempt] = useState(0);
  const retried = useRef(false);
  const alive = useRef(true);
  // A new number for every thing this view is pointed at, so an answer for an earlier piece is dropped.
  const request = useRef(0);

  const wanted = hasPhoto !== false;

  const resolve = useCallback(async (): Promise<Source | null> => {
    try {
      if (connectionId && itemId) return await proPhotoSource(connectionId, itemId);
      if (ownPath) {
        const signed = await signStoragePaths([ownPath]);
        const uri = signed.get(ownPath);
        return uri ? { uri } : null;
      }
    } catch {
      // No photo is the answer for a failure; the placeholder is the whole error state.
    }
    return null;
  }, [connectionId, itemId, ownPath]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    const mine = ++request.current;
    retried.current = false;
    setBroken(false);
    setSource(null);
    setAttempt(0);
    if (!wanted) return;
    resolve().then(next => {
      if (!alive.current || mine !== request.current) return;
      if (next) setSource(next);
      else setBroken(true);
    });
  }, [wanted, resolve]);

  const onError = () => {
    if (retried.current) {
      setBroken(true);
      return;
    }
    retried.current = true;
    const mine = request.current;
    resolve().then(next => {
      if (!alive.current || mine !== request.current) return;
      if (next) {
        setSource(next);
        setAttempt(n => n + 1);
      } else {
        setBroken(true);
      }
    });
  };

  if (!wanted || !source || broken) {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        style={[styles.placeholder, { backgroundColor: theme.colors.muted }, style as any]}
      >
        <Icon name="shirt-outline" size={28} color={theme.colors.textSubtle} />
      </View>
    );
  }

  return (
    <Image
      key={attempt}
      source={source}
      style={style}
      resizeMode="cover"
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onError={onError}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});

export default ProPhoto;
