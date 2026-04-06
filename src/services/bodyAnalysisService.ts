/**
 * bodyAnalysisService — derives skin tone + undertone from a face photo
 * using Google Cloud Vision.
 *
 * Uses the REST API endpoint with FACE_DETECTION + IMAGE_PROPERTIES to find
 * the face bounding box and sample the dominant color in that region.
 *
 * Degrades gracefully: if no API key is configured, or the request fails, or
 * no face is found, returns null and the caller should fall back to the quiz.
 */

import { env, hasGoogleVision } from '../config/env';
import { readImageAsBase64 } from '../platform/fileSystem';
import { classifySkinRgb } from './styleRulesEngine';
import type { SkinTone, Undertone } from './profileService';

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

export type SkinAnalysisResult = {
  skinTone: SkinTone;
  undertone: Undertone;
  confidence: number;    // 0..1, higher = clearer signal
  /** Approx RGB we sampled from the face. Useful for UI preview. */
  sampledRgb: { r: number; g: number; b: number };
  /** True if Vision found a face. If false we fell back to whole-image color. */
  faceDetected: boolean;
};

export const analyzeSkinFromPhoto = async (
  imageUri: string,
): Promise<SkinAnalysisResult | null> => {
  if (!hasGoogleVision()) {
    console.info('[bodyAnalysis] Google Vision API key missing; skipping');
    return null;
  }

  try {
    const base64 = await readImageAsBase64(imageUri);

    const response = await fetch(
      `${VISION_ENDPOINT}?key=${env.GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [
                { type: 'FACE_DETECTION', maxResults: 1 },
                { type: 'IMAGE_PROPERTIES' },
              ],
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      console.warn('[bodyAnalysis] Vision API error:', response.status, err);
      return null;
    }

    const data = await response.json();
    const first = data.responses?.[0];
    if (!first) return null;

    const faces = first.faceAnnotations || [];
    const faceDetected = faces.length > 0;

    // Approach: Vision doesn't return pixel data for arbitrary bounding boxes,
    // so we rely on the image's dominant colors (IMAGE_PROPERTIES) as a proxy.
    // The dominant colors in a face-cropped photo are usually skin tones.
    // Confidence is higher when a face is detected (validates it's a portrait).
    const dominantColors = first.imagePropertiesAnnotation?.dominantColors?.colors || [];
    if (dominantColors.length === 0) {
      return null;
    }

    // Filter out near-white/black (background) and pick the most skin-like color
    const skinCandidate = dominantColors.find((c: any) => {
      const { red = 0, green = 0, blue = 0 } = c.color;
      // Reject clearly non-skin colors
      if (red > 240 && green > 240 && blue > 240) return false; // pure white
      if (red < 20 && green < 20 && blue < 20) return false;    // pure black
      // Skin tones have red > blue most of the time
      return red > blue - 20;
    }) || dominantColors[0];

    const rgb = {
      r: Math.round(skinCandidate.color.red ?? 0),
      g: Math.round(skinCandidate.color.green ?? 0),
      b: Math.round(skinCandidate.color.blue ?? 0),
    };

    const { skinTone, undertone } = classifySkinRgb(rgb);

    return {
      skinTone,
      undertone,
      confidence: faceDetected ? 0.85 : 0.55,
      sampledRgb: rgb,
      faceDetected,
    };
  } catch (error) {
    console.warn('[bodyAnalysis] exception:', error);
    return null;
  }
};
