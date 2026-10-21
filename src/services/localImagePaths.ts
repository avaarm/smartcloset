import RNFS from 'react-native-fs';

/**
 * Guest-mode photos are stored as absolute file paths inside the app's Documents
 * folder. iOS can change the app's container location (a reinstall, restoring a
 * backup onto a new phone, some updates), after which every saved path points at
 * a folder that no longer exists and all photos go blank even though the files
 * were carried across. Re-anchor such paths to the current Documents folder.
 */
export const rehomeLocalImage = (uri?: string): string | undefined => {
  if (!uri) return uri;
  const isFile = uri.startsWith('file://') || uri.startsWith('/');
  if (!isFile) return uri;
  const marker = '/Documents/';
  const at = uri.lastIndexOf(marker);
  if (at === -1) return uri;
  const tail = uri.slice(at + marker.length);
  if (!tail) return uri;
  return `file://${RNFS.DocumentDirectoryPath}/${tail}`;
};

export const rehomeItemImages = <T extends { userImage?: string; retailerImage?: string; images?: string[] }>(item: T): T => {
  const userImage = rehomeLocalImage(item.userImage);
  const retailerImage = rehomeLocalImage(item.retailerImage);
  // The gallery's paths live in the same per-install folder as the cover, so they move with it.
  const images = Array.isArray(item.images) ? item.images.map(u => rehomeLocalImage(u) ?? u) : undefined;
  const galleryMoved = !!images && images.some((u, i) => u !== item.images![i]);
  if (userImage === item.userImage && retailerImage === item.retailerImage && !galleryMoved) return item;
  return { ...item, userImage, retailerImage, ...(galleryMoved ? { images } : {}) };
};
