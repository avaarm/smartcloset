import RNFS from 'react-native-fs';
import { supabase } from '../config/supabase';

const BUCKET = 'wardrobe-images';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAuthUserId = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * Upload an image to Supabase Storage and return its public URL.
 * Falls back to local-only storage for guests.
 */
const uploadToCloud = async (localPath: string): Promise<string | null> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return null;

    const sourcePath = localPath.replace('file://', '');
    const base64 = await RNFS.readFile(sourcePath, 'base64');
    const fileName = `${userId}/${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, decode(base64), {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (error) {
      console.warn('[imageStorage] Upload failed, keeping local:', error.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    return urlData?.publicUrl ?? null;
  } catch (err) {
    console.warn('[imageStorage] Cloud upload error:', err);
    return null;
  }
};

/** Decode base64 string to Uint8Array (needed for Supabase Storage upload). */
function decode(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bufferLength = (base64.length * 3) / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const a = chars.indexOf(base64[i]);
    const b = chars.indexOf(base64[i + 1]);
    const c = chars.indexOf(base64[i + 2]);
    const d = chars.indexOf(base64[i + 3]);
    bytes[p++] = (a << 2) | (b >> 4);
    if (c !== -1 && base64[i + 2] !== '=') bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (d !== -1 && base64[i + 3] !== '=') bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Normalize a picker-returned URI to an absolute filesystem path.
 * Handles: file:// prefix, URL-encoded characters (spaces, unicode), and
 * /private-prefixed paths (iOS exposes /var/... which RNFS reads as /private/var/...).
 */
const uriToPath = (uri: string): string => {
  let p = uri.startsWith('file://') ? uri.substring('file://'.length) : uri;
  try {
    p = decodeURIComponent(p);
  } catch {
    // Leave as-is if decoding fails
  }
  return p;
};

/**
 * Resolve a source path that actually exists on disk. iOS returns paths that
 * sometimes need /private prefixed (or stripped) to match the real location.
 */
const resolveExistingPath = async (rawPath: string): Promise<string | null> => {
  if (await RNFS.exists(rawPath)) return rawPath;
  // Try with /private prefix (iOS maps /var -> /private/var internally)
  if (rawPath.startsWith('/var/')) {
    const privPath = `/private${rawPath}`;
    if (await RNFS.exists(privPath)) return privPath;
  }
  // Try stripping /private (inverse case)
  if (rawPath.startsWith('/private/var/')) {
    const noPriv = rawPath.substring('/private'.length);
    if (await RNFS.exists(noPriv)) return noPriv;
  }
  return null;
};

/**
 * Copies an image from a temporary location to permanent storage.
 * For authenticated users, also uploads to Supabase Storage and returns the
 * cloud URL. For guests, returns the local file:// path.
 *
 * Robust to iOS PHPicker quirks — if the copy fails, we fall back to reading
 * the file directly into Documents via base64 so the permanent URI we return
 * always points at a file we own.
 */
export const copyImageToPermanentStorage = async (tempUri: string): Promise<string> => {
  // Already a cloud URL — nothing to do
  if (tempUri.startsWith('http')) return tempUri;

  // Already in document directory — just try cloud upload
  if (tempUri.includes(RNFS.DocumentDirectoryPath)) {
    const cloudUrl = await uploadToCloud(tempUri);
    return cloudUrl || tempUri;
  }

  const timestamp = Date.now();
  const filename = `clothing_${timestamp}.jpg`;
  const destPath = `${RNFS.DocumentDirectoryPath}/${filename}`;
  const localUri = `file://${destPath}`;

  const rawPath = uriToPath(tempUri);
  const sourcePath = await resolveExistingPath(rawPath);

  if (!sourcePath) {
    // The picker handed us a URI whose file is gone. On iOS this can happen
    // when the PHPicker sandbox expires between callback and copy. Last
    // resort: try a read+write via base64 (sometimes RNFS.readFile succeeds
    // where copyFile fails due to permission nuances).
    try {
      const base64 = await RNFS.readFile(rawPath, 'base64');
      await RNFS.writeFile(destPath, base64, 'base64');
    } catch (readErr) {
      console.error('[imageStorage] source file not accessible:', rawPath, readErr);
      throw new Error(
        'Could not read the selected image. Try picking it again.',
      );
    }
  } else {
    try {
      await RNFS.copyFile(sourcePath, destPath);
    } catch (copyErr) {
      // Fall back to base64 round-trip (some iOS simulator states block copyFile)
      console.warn('[imageStorage] copyFile failed, trying base64 fallback:', copyErr);
      const base64 = await RNFS.readFile(sourcePath, 'base64');
      await RNFS.writeFile(destPath, base64, 'base64');
    }
  }

  // Try cloud upload for authenticated users (falls back to local URI)
  const cloudUrl = await uploadToCloud(localUri);
  return cloudUrl || localUri;
};

/**
 * Deletes an image from permanent storage (local and cloud).
 */
export const deleteImageFromStorage = async (imageUri: string): Promise<void> => {
  try {
    // Delete from cloud if it's a Supabase URL
    if (imageUri.includes(BUCKET)) {
      const path = imageUri.split(`${BUCKET}/`)[1];
      if (path) {
        await supabase.storage.from(BUCKET).remove([path]);
      }
    }

    // Delete local file if it exists
    if (!imageUri.startsWith('http') && imageUri.includes(RNFS.DocumentDirectoryPath)) {
      const filePath = imageUri.replace('file://', '');
      const exists = await RNFS.exists(filePath);
      if (exists) {
        await RNFS.unlink(filePath);
      }
    }
  } catch (error) {
    console.error('Error deleting image from storage:', error);
    // Don't throw — deletion failures shouldn't break the app
  }
};
