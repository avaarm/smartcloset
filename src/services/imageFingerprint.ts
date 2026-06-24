/**
 * imageFingerprint — perceptual(-ish) hashing for clothing photos.
 *
 * Two kinds of fingerprint, used for two kinds of match:
 *
 *   1. contentHash   — djb2 over the base64. Stable for the SAME file only.
 *                      Fast, tiny, useful for "did this exact upload happen
 *                      before" (e.g. the same user retrying).
 *
 *   2. semanticFingerprint — quantized color palette + top Vision labels.
 *                      Tolerant of crop, angle, compression, resize. Two
 *                      photos of the same burgundy clutch taken from slightly
 *                      different angles produce nearly identical fingerprints
 *                      because they share the same dominant colors AND
 *                      overlapping Vision labels.
 *
 *                      Shape: `c:RRGGBB_RRGGBB_RRGGBB|l:label1_label2_label3`
 *                      (top 3 palette colors, RGB-quantized to 64 levels per
 *                      channel, sorted descending by weight; top 3 labels
 *                      lowercased and sorted.)
 *
 * For fuzzy matching, `hammingDistance()` compares two semantic fingerprints
 * by counting label differences + RGB-bucket differences. <5 = near match.
 */

import type { RecognitionResult, DetectedColor } from './imageRecognition';

// ─── Content hash (exact match) ─────────────────────────────────────────────

const djb2 = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) & 0xffffffff;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};

/**
 * Quick hash over a base64 content sample. Stable for the same bytes.
 */
export const hashImageBase64 = (base64: string): string => {
  let sampled = '';
  for (let i = 0; i < base64.length; i += 37) {
    sampled += base64[i];
  }
  return djb2(sampled);
};

// ─── Semantic fingerprint (fuzzy match) ─────────────────────────────────────

/**
 * Quantize a single 0–255 channel to 6 bits (64 levels). Lossy but stable
 * against minor JPEG variation and lighting shifts.
 */
const quantizeChannel = (n: number): number => (n >> 2) & 0x3f;

/**
 * Convert an RGB value (each 0–255) to a quantized hex string for use in the
 * fingerprint. Two very-similar colors will produce the same output.
 */
const quantRgbToHex = (r: number, g: number, b: number): string => {
  const qr = quantizeChannel(r);
  const qg = quantizeChannel(g);
  const qb = quantizeChannel(b);
  // Pack 6+6+6 bits = 18 bits → 5 hex chars
  const v = (qr << 12) | (qg << 6) | qb;
  return v.toString(16).padStart(5, '0');
};

/**
 * Parse a #RRGGBB string into RGB channels. Returns null on malformed input.
 */
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
};

/**
 * Semantic tokens that are too generic to identify a garment. Filtering them
 * out of the label set keeps the fingerprint from collapsing onto huge
 * numbers of unrelated items.
 */
const LABEL_STOPWORDS = new Set([
  'fashion', 'clothing', 'product', 'design', 'pattern', 'style', 'apparel',
  'material', 'textile', 'accessory', 'accessories', 'photograph',
  'photography', 'image', 'picture', 'white background', 'background',
]);

/**
 * Build a semantic fingerprint from a Vision RecognitionResult.
 *
 * Uses top 3 quantized colors + top 3 non-stopword labels.
 *
 * Example:
 *   c:23082_12040_57542|l:handbag_leather_maroon
 */
export const semanticFingerprint = (result: RecognitionResult): string => {
  // ── Colors: quantize top 3 by weight ──
  const colorParts: string[] = [];
  const colors = (result.colors || [])
    .filter((c: DetectedColor) => c.hex && c.weight > 0.02)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  for (const c of colors) {
    const rgb = hexToRgb(c.hex);
    if (rgb) colorParts.push(quantRgbToHex(rgb.r, rgb.g, rgb.b));
  }
  // Pad with zeros if fewer than 3 — keeps shape stable
  while (colorParts.length < 3) colorParts.push('00000');

  // ── Labels: top 3 non-stopword, lowercased, sorted alphabetically ──
  const labels = (result.rawLabels || [])
    .map(l => l.toLowerCase().trim())
    .filter(l => l.length > 2 && !LABEL_STOPWORDS.has(l))
    .slice(0, 6); // take first 6 raw, then prune to 3 most specific
  const sortedLabels = Array.from(new Set(labels)).sort().slice(0, 3);
  while (sortedLabels.length < 3) sortedLabels.push('');

  return `c:${colorParts.join('_')}|l:${sortedLabels.join('_')}`;
};

/**
 * Combined legacy fingerprint (content hash + labels) — kept for
 * backward compatibility with contributions written before semantic
 * fingerprints existed.
 */
export const buildFingerprint = (
  base64: string,
  result: RecognitionResult,
): string => {
  const contentHash = hashImageBase64(base64);
  const labels = (result.rawLabels || [])
    .slice(0, 3)
    .map(l => l.toLowerCase())
    .sort()
    .join('|');
  return `${contentHash}:${labels}`;
};

// ─── Fuzzy match scoring ────────────────────────────────────────────────────

/**
 * Parse a semantic fingerprint back into its components. Returns null on
 * malformed input.
 */
const parseSemanticFingerprint = (
  fp: string,
): { colors: string[]; labels: string[] } | null => {
  const m = /^c:([a-f0-9_]+)\|l:(.+)$/i.exec(fp);
  if (!m) return null;
  return {
    colors: m[1].split('_'),
    labels: m[2].split('_'),
  };
};

/**
 * Manhattan distance between two quantized 18-bit color values. Returns 0
 * for identical colors, scales up for perceptual difference. Max ~189.
 */
const colorDistance = (hex1: string, hex2: string): number => {
  if (hex1 === hex2) return 0;
  const v1 = parseInt(hex1, 16);
  const v2 = parseInt(hex2, 16);
  const r1 = (v1 >> 12) & 0x3f;
  const g1 = (v1 >> 6) & 0x3f;
  const b1 = v1 & 0x3f;
  const r2 = (v2 >> 12) & 0x3f;
  const g2 = (v2 >> 6) & 0x3f;
  const b2 = v2 & 0x3f;
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
};

/**
 * Similarity score between two semantic fingerprints. Returns 0..1, higher
 * = more similar. Blends color palette proximity (2/3 weight) with label
 * overlap (1/3 weight).
 *
 * Two photos of the same item typically score > 0.6; unrelated items
 * typically < 0.3.
 */
export const similarityScore = (a: string, b: string): number => {
  if (a === b) return 1;
  const pa = parseSemanticFingerprint(a);
  const pb = parseSemanticFingerprint(b);
  if (!pa || !pb) return 0;

  // ── Color score: closest-pair matching between the top-3 palettes ──
  let colorScore = 0;
  let matched = 0;
  const bColorsLeft = [...pb.colors];
  for (const ca of pa.colors) {
    if (ca === '00000') continue;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < bColorsLeft.length; i++) {
      if (bColorsLeft[i] === '00000') continue;
      const d = colorDistance(ca, bColorsLeft[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      // Map distance 0..60 → score 1..0 (beyond 60 is unrelated)
      colorScore += Math.max(0, 1 - bestDist / 60);
      matched++;
      bColorsLeft[bestIdx] = '00000'; // don't re-match
    }
  }
  colorScore = matched > 0 ? colorScore / matched : 0;

  // ── Label score: Jaccard similarity over non-empty labels ──
  const setA = new Set(pa.labels.filter(Boolean));
  const setB = new Set(pb.labels.filter(Boolean));
  const union = new Set([...setA, ...setB]);
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const labelScore = union.size > 0 ? intersection / union.size : 0;

  return colorScore * 0.67 + labelScore * 0.33;
};

/**
 * Returns true if two fingerprints are "close enough" to be treated as
 * the same item. Default threshold of 0.55 is conservative — tune based
 * on real-world accept/reject ratios once there's data.
 */
export const isFingerprintNearMatch = (
  a: string,
  b: string,
  threshold = 0.55,
): boolean => similarityScore(a, b) >= threshold;
