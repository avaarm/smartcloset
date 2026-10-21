/**
 * imagePicker — native implementation.
 *
 * Minimal photo library picker using react-native-image-picker. On iOS this
 * goes through the Photos framework (PHPicker on iOS 14+) which does NOT
 * require NSPhotoLibraryUsageDescription in strict mode — but we declare it
 * anyway for safety. On Android, uses the system picker (which doesn't need
 * READ_MEDIA_IMAGES for picker-selected photos, but we declare for gallery
 * access).
 *
 * Deliberately exposes ONLY library picking — no camera. Taking a photo
 * inside the picker UI is allowed by iOS without NSCameraUsageDescription.
 */

import { launchImageLibrary, type Asset, type PhotoQuality } from 'react-native-image-picker';

export type PickedImage = {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string;
  fileSize?: number;
  fileName?: string;
};

// Same options for one photo or several: the photos go to the AI search, which reads no more than about
// 1600 px of them, so smaller uploads sooner.
const LIBRARY_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.85 as unknown as PhotoQuality, // 0.85 is valid at runtime; the lib's type lists only tenths
  maxWidth: 1600,
  maxHeight: 1600,
  includeBase64: false,
  includeExtra: false,
};

const toPickedImage = (asset: Asset): PickedImage => ({
  uri: asset.uri as string,
  width: asset.width,
  height: asset.height,
  mimeType: asset.type,
  fileSize: asset.fileSize,
  fileName: asset.fileName ?? undefined,
});

export const pickImageFromLibrary = async (): Promise<PickedImage | null> => {
  const result = await launchImageLibrary({ ...LIBRARY_OPTIONS, selectionLimit: 1 });

  if (result.didCancel || result.errorCode) {
    return null;
  }

  const asset = result.assets?.[0];
  if (!asset?.uri) return null;

  return toPickedImage(asset);
};

/**
 * Pick up to `limit` photos at once (the library's own multi-select). Returns [] when the person cancels, the
 * library cannot be opened or nothing usable came back; never more than `limit`.
 */
export const pickImagesFromLibrary = async ({ limit }: { limit: number }): Promise<PickedImage[]> => {
  const slots = Math.floor(limit);
  // 0 would mean "no limit" to the library, so a full gallery must not open it at all.
  if (!(slots >= 1)) return [];

  const result = await launchImageLibrary({ ...LIBRARY_OPTIONS, selectionLimit: slots });

  if (result.didCancel || result.errorCode) {
    return [];
  }

  return (result.assets ?? [])
    .filter(asset => !!asset?.uri)
    .slice(0, slots)
    .map(toPickedImage);
};
