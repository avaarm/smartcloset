/**
 * fileSystem — native implementation using react-native-fs.
 *
 * Matching web shim at ./fileSystem.web.ts uses fetch + FileReader.
 * Metro / Vite pick the right one via platform-extension resolution.
 */

import RNFS from 'react-native-fs';
import { resolveImageUrl } from '../services/imageUrls';

/**
 * Read any image URI and return its base64 content (NO data-URL prefix).
 * Handles: local file://, remote https://, and pre-encoded data: URIs.
 */
export const readImageAsBase64 = async (uri: string): Promise<string> => {
  if (uri.startsWith('data:')) {
    const idx = uri.indexOf(',');
    return idx >= 0 ? uri.substring(idx + 1) : uri;
  }

  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    // Remote image — download into a temp file then read
    const tempPath = `${RNFS.TemporaryDirectoryPath}/remote_${Date.now()}.bin`;
    // Private-bucket photos need a signed link to be downloadable.
    const fromUrl = await resolveImageUrl(uri);
    const result = await RNFS.downloadFile({ fromUrl, toFile: tempPath }).promise;
    if (result.statusCode !== 200) {
      throw new Error(`Failed to fetch image (${result.statusCode})`);
    }
    const b64 = await RNFS.readFile(tempPath, 'base64');
    RNFS.unlink(tempPath).catch(() => {});
    return b64;
  }

  // Local file:// URI or bare path
  const path = uri.startsWith('file://') ? uri.substring('file://'.length) : uri;
  return RNFS.readFile(path, 'base64');
};

/** A path without its scheme, percent escapes or trailing slashes; null when it climbs out of its folder. */
const plainPath = (uri: string): string | null => {
  let path = uri.startsWith('file://') ? uri.substring('file://'.length) : uri;
  if (uri.startsWith('file://')) {
    try {
      path = decodeURI(path);
    } catch {
      return null;
    }
  }
  if (!path.startsWith('/') || path.split('/').includes('..')) return null;
  return path.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
};

/** iOS reports the same folder as /var/... and /private/var/...; they are one place. */
const sameRoot = (path: string): string => path.replace(/^\/private(?=\/var\/)/, '');

/**
 * Delete a photo the picker copied into the app's cache or temp folder (a tag photo is read once and not kept).
 * Only a file inside RNFS.CachesDirectoryPath or RNFS.TemporaryDirectoryPath is ever removed: never a photo in the
 * person's library, a documents file or the folder itself. Errors are swallowed; a leftover cache file is not worth
 * a failed scan.
 */
export const discardTempImage = async (uri: string): Promise<void> => {
  try {
    if (typeof uri !== 'string' || uri === '') return;
    if (uri.includes('://') && !uri.startsWith('file://')) return;
    const path = plainPath(uri);
    if (!path) return;
    const roots = [RNFS.CachesDirectoryPath, RNFS.TemporaryDirectoryPath]
      .filter((root): root is string => typeof root === 'string' && root.length > 1)
      .map(root => plainPath(root))
      .filter((root): root is string => !!root);
    const inside = roots.some(root => sameRoot(path).startsWith(`${sameRoot(root)}/`));
    if (!inside) return;
    await RNFS.unlink(path);
  } catch {
    // Already gone, or not ours to remove.
  }
};
