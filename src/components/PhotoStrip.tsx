/**
 * PhotoStrip: every photo of a piece in one row of thumbnails, under the big cover photo on Add / Edit item.
 *
 * The first photo is the cover (marked "Cover"). Each of the others has a "Make cover" button, and every thumbnail has
 * a remove button. Photos that came from a picked shop match say "From the shop". The row ends with "Add photos"
 * (the library, several at once) and, when the screen offers it, "Take photo"; both go away at the limit, and the
 * line under the row says how many photos there are and why nothing more can be added.
 *
 * The strip holds no state about the photos: the screen owns the list and decides what each action does.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import theme from '../styles/theme';
import { MAX_ITEM_IMAGES } from '../utils/itemImages';

export const COVER_LABEL = 'Cover';
export const MAKE_COVER_LABEL = 'Make cover';
export const SHOP_PHOTO_LABEL = 'From the shop';
export const ADD_PHOTOS_LABEL = 'Add photos';
export const CAMERA_LABEL = 'Camera';
// What a screen reader says; it holds the visible word, and differs from the tag scanner's own "Take photo".
export const TAKE_PHOTO_A11Y_LABEL = 'Take a photo with the camera';

const THUMB = 84;

export interface PhotoStripProps {
  /** Every photo, cover first. */
  photos: ReadonlyArray<string>;
  /** The photos that came from a picked shop match. */
  shopPhotos?: ReadonlyArray<string>;
  max?: number;
  /** Photos are being added: the add buttons wait. */
  adding?: boolean;
  /** Nothing can be changed right now (the cover is being read). */
  disabled?: boolean;
  onAdd: () => void;
  /** Without it the "Take photo" tile is not shown. */
  onTakePhoto?: () => void;
  onMakeCover: (uri: string) => void;
  onRemove: (uri: string) => void;
}

const captionFor = (count: number, max: number): string => {
  if (count >= max) return `${count} of ${max} photos. Remove one to add another.`;
  if (count === 0) return `Up to ${max} photos. The first one is the cover.`;
  return `${count} of ${max} photos. The first one is the cover.`;
};

const Thumb: React.FC<{
  uri: string;
  index: number;
  total: number;
  isCover: boolean;
  fromShop: boolean;
  disabled: boolean;
  onMakeCover: (uri: string) => void;
  onRemove: (uri: string) => void;
}> = ({ uri, index, total, isCover, fromShop, disabled, onMakeCover, onRemove }) => {
  // A shop picture can be blocked or gone; show a placeholder rather than an empty box. It can still be removed.
  const [failed, setFailed] = useState(false);
  const position = `photo ${index + 1} of ${total}`;

  return (
    <View style={styles.tile}>
      <View
        style={[styles.thumbBox, isCover && styles.thumbBoxCover]}
        accessible
        accessibilityLabel={`${position}${isCover ? ', the cover' : ''}${fromShop ? ', from the shop' : ''}`}
      >
        {failed ? (
          <View style={[styles.thumb, styles.thumbFailed]}>
            <Icon name="image-outline" size={24} color={theme.colors.mediumGray} />
          </View>
        ) : (
          <Image source={{ uri }} style={styles.thumb} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
        )}
        {fromShop && (
          <View style={styles.shopTag}>
            <Text style={styles.shopTagText} numberOfLines={1}>
              {SHOP_PHOTO_LABEL}
            </Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={() => onRemove(uri)}
        disabled={disabled}
        hitSlop={10}
        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed, disabled && styles.off]}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${position}`}
        accessibilityState={{ disabled }}
      >
        <Icon name="close" size={14} color="#FFFFFF" />
      </Pressable>

      {isCover ? (
        <Text style={styles.coverLabel}>{COVER_LABEL}</Text>
      ) : (
        <Pressable
          onPress={() => onMakeCover(uri)}
          disabled={disabled}
          hitSlop={{ top: 4, bottom: 8, left: 4, right: 4 }}
          style={({ pressed }) => [styles.makeCover, pressed && styles.pressed, disabled && styles.off]}
          accessibilityRole="button"
          accessibilityLabel={`Make ${position} the cover`}
          accessibilityState={{ disabled }}
        >
          <Text style={styles.makeCoverText}>{MAKE_COVER_LABEL}</Text>
        </Pressable>
      )}
    </View>
  );
};

const AddTile: React.FC<{
  icon: string;
  label: string;
  a11yLabel?: string;
  hint: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}> = ({ icon, label, a11yLabel, hint, busy, disabled, onPress }) => (
  <View style={styles.tile}>
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.addTile, pressed && styles.pressed, (disabled || busy) && styles.off]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: disabled || busy, busy }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.accent} />
      ) : (
        <Icon name={icon} size={24} color={theme.colors.accent} />
      )}
      <Text style={styles.addTileText}>{busy ? 'Adding...' : label}</Text>
    </Pressable>
  </View>
);

const PhotoStrip: React.FC<PhotoStripProps> = ({
  photos,
  shopPhotos = [],
  max = MAX_ITEM_IMAGES,
  adding = false,
  disabled = false,
  onAdd,
  onTakePhoto,
  onMakeCover,
  onRemove,
}) => {
  const full = photos.length >= max;
  const room = Math.max(0, max - photos.length);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.row}
        accessibilityLabel="Photos of this piece"
      >
        {photos.map((uri, index) => (
          <Thumb
            key={uri}
            uri={uri}
            index={index}
            total={photos.length}
            isCover={index === 0}
            fromShop={shopPhotos.includes(uri)}
            disabled={disabled}
            onMakeCover={onMakeCover}
            onRemove={onRemove}
          />
        ))}
        {!full && (
          <AddTile
            icon="images-outline"
            label={ADD_PHOTOS_LABEL}
            hint={`Choose up to ${room} from your library`}
            busy={adding}
            disabled={disabled}
            onPress={onAdd}
          />
        )}
        {!full && !!onTakePhoto && (
          <AddTile
            icon="camera-outline"
            label={CAMERA_LABEL}
            a11yLabel={TAKE_PHOTO_A11Y_LABEL}
            hint="Adds one more photo from the camera"
            busy={false}
            disabled={disabled || adding}
            onPress={onTakePhoto}
          />
        )}
      </ScrollView>
      <Text style={styles.caption}>{captionFor(photos.length, max)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  // The row is scrolled, so the padding at its end keeps the last tile off the screen edge.
  row: { flexDirection: 'row', gap: 10, paddingTop: 8, paddingRight: 8 },
  tile: { width: THUMB, alignItems: 'center' },
  thumbBox: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.mutedBackground,
  },
  thumbBoxCover: { borderWidth: 2, borderColor: theme.colors.accent },
  thumb: { width: '100%', height: '100%' },
  thumbFailed: { alignItems: 'center', justifyContent: 'center' },
  shopTag: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 2,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(16,14,11,0.65)',
  },
  shopTagText: { fontSize: 10, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.text,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  coverLabel: { marginTop: 6, fontSize: 12, fontWeight: '700', color: theme.colors.accent },
  makeCover: { marginTop: 4, paddingVertical: 4, minHeight: 28, justifyContent: 'center' },
  makeCoverText: { fontSize: 12, fontWeight: '600', color: theme.colors.accent },
  addTile: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  addTileText: { fontSize: 11, fontWeight: '600', color: theme.colors.accent, textAlign: 'center' },
  pressed: { opacity: 0.7 },
  off: { opacity: 0.4 },
  caption: { marginTop: 6, fontSize: 12, color: theme.colors.textMuted },
});

export default PhotoStrip;
