/**
 * fileSystem — native implementation using react-native-fs.
 *
 * Matching web shim at ./fileSystem.web.ts uses fetch + FileReader.
 * Metro / Vite pick the right one via platform-extension resolution.
 */

import RNFS from 'react-native-fs';

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
    const result = await RNFS.downloadFile({ fromUrl: uri, toFile: tempPath }).promise;
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
