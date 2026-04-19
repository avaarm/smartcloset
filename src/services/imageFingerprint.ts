/**
 * imageFingerprint — lightweight perceptual hash for clothing photos.
 *
 * We can't import a real pHash library without adding a native dep, so we
 * build a simple hash from:
 *   1. A SHA-256-like digest of the downsampled base64 content (bucketed)
 *   2. The top-3 Vision API labels (sorted, lowercased)
 *
 * Two images of the same item should produce the same hash with high
 * probability — good enough to detect "this user is uploading the same
 * handbag someone else already contributed."
 *
 * The hash is the KEY used to look up historical contributions and canonical
 * records in the knowledge base.
 */

import type { RecognitionResult } from './imageRecognition';

/**
 * Quick & deterministic string hash (djb2 variant).
 * Returns a hex string of reasonable length for use as a lookup key.
 */
const djb2 = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) & 0xffffffff;
  }
  // Convert to positive hex
  return (h >>> 0).toString(16).padStart(8, '0');
};

/**
 * Bucketed digest of a base64 image — groups similar-content images together
 * by taking every Nth character, reducing to a coarse fingerprint that's
 * stable across minor JPEG re-compressions.
 *
 * Not a real perceptual hash (no DCT / average-hash math) but cheap and
 * avoids requiring a native dep. Good enough for the knowledge-base "have
 * we seen this roughly?" signal.
 */
export const hashImageBase64 = (base64: string): string => {
  // Take every 37th char (coarse sample)
  let sampled = '';
  for (let i = 0; i < base64.length; i += 37) {
    sampled += base64[i];
  }
  return djb2(sampled);
};

/**
 * Build a composite fingerprint from the raw base64 + the Vision labels.
 *
 * Example: "a1b2c3d4:bag|leather|maroon"
 *
 * The label portion makes same-image-different-crop buckets collapse while
 * keeping the content hash for exact-match acceleration.
 */
export const buildFingerprint = (
  base64: string,
  result: RecognitionResult,
): string => {
  const contentHash = hashImageBase64(base64);

  // Use top labels as a semantic tie-breaker
  const labels = (result.rawLabels || [])
    .slice(0, 3)
    .map(l => l.toLowerCase())
    .sort()
    .join('|');

  return `${contentHash}:${labels}`;
};
