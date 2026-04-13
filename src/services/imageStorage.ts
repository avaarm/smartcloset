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
 * Copies an image from a temporary location to permanent storage.
 * For authenticated users, also uploads to Supabase Storage and returns the
 * cloud URL. For guests, returns the local file:// path.
 */
export const copyImageToPermanentStorage = async (tempUri: string): Promise<string> => {
  try {
    // Already a cloud URL — nothing to do
    if (tempUri.startsWith('http')) return tempUri;

    // Already in document directory
    if (tempUri.includes(RNFS.DocumentDirectoryPath)) {
      // Still try cloud upload for authenticated users
      const cloudUrl = await uploadToCloud(tempUri);
      return cloudUrl || tempUri;
    }

    // Copy temp → permanent local path first
    const timestamp = Date.now();
    const filename = `clothing_${timestamp}.jpg`;
    const destPath = `${RNFS.DocumentDirectoryPath}/${filename}`;
    const sourcePath = tempUri.replace('file://', '');
    await RNFS.copyFile(sourcePath, destPath);
    const localUri = `file://${destPath}`;

    // Try cloud upload (non-blocking for UX — returns cloud URL if fast enough)
    const cloudUrl = await uploadToCloud(localUri);
    return cloudUrl || localUri;
  } catch (error) {
    console.error('Error copying image to permanent storage:', error);
    throw error;
  }
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
