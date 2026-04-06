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

import { launchImageLibrary } from 'react-native-image-picker';

export type PickedImage = {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string;
  fileSize?: number;
  fileName?: string;
};

export const pickImageFromLibrary = async (): Promise<PickedImage | null> => {
  const result = await launchImageLibrary({
    mediaType: 'photo',
    quality: 0.85,
    selectionLimit: 1,
    includeBase64: false,
    includeExtra: false,
  });

  if (result.didCancel || result.errorCode) {
    return null;
  }

  const asset = result.assets?.[0];
  if (!asset?.uri) return null;

  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: asset.type,
    fileSize: asset.fileSize,
    fileName: asset.fileName ?? undefined,
  };
};
