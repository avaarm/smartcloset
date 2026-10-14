/**
 * Decides whether a photo may be shown to people who are not the owner's friends, from
 * Google Cloud Vision's SAFE_SEARCH_DETECTION and FACE_DETECTION answers. Pure, so it is
 * unit-tested in Jest and used unchanged by the swap-media edge function.
 *
 * Fails closed: a missing or malformed answer is a rejection, never a pass. That includes an answer
 * of UNKNOWN for any of the four categories that are judged (adult, violence, racy, medical): Google
 * says UNKNOWN when it could not tell, and "could not tell" must never publish a photo to strangers.
 * (A response with no faceAnnotations at all is normal and means no face was found; Vision leaves
 * empty lists out. A faceAnnotations that is present but is not a list is malformed.)
 */

export type Likelihood = 'UNKNOWN' | 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY';

export type VisionVertex = { x?: number; y?: number };
export type VisionAnnotation = {
  safeSearchAnnotation?: {
    adult?: Likelihood; violence?: Likelihood; racy?: Likelihood; medical?: Likelihood; spoof?: Likelihood;
  };
  faceAnnotations?: Array<{ detectionConfidence?: number; boundingPoly?: { vertices?: VisionVertex[] } }>;
  error?: { code?: number; message?: string };
};

export type PhotoDecision =
  | { ok: true }
  | { ok: false; reason: 'unsafe' | 'people' | 'unreadable' };

const RANK: Record<Likelihood, number> = {
  UNKNOWN: -1, VERY_UNLIKELY: 1, UNLIKELY: 2, POSSIBLE: 3, LIKELY: 4, VERY_LIKELY: 5,
};
/** Below zero means "no usable answer": absent, not a known word, or UNKNOWN. */
const rank = (v: Likelihood | undefined): number => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(RANK, v) ? RANK[v] : -1);

/** Thresholds, in one place so they can be tuned after real photos have been seen. */
export const PHOTO_RULES = {
  adultAtLeast: 'POSSIBLE',
  violenceAtLeast: 'LIKELY',
  medicalAtLeast: 'LIKELY',
  racyAtLeast: 'VERY_LIKELY',
  faceConfidence: 0.8,
  faceShareOfFrame: 0.04,
} as const;

const faceArea = (vertices: VisionVertex[] | undefined): number => {
  const v = vertices ?? [];
  if (v.length < 3) return 0;
  const xs = v.map(p => p.x ?? 0);
  const ys = v.map(p => p.y ?? 0);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
};

export const decideSwapPhoto = (a: VisionAnnotation | undefined, width: number, height: number): PhotoDecision => {
  if (!a || a.error || !a.safeSearchAnnotation || !(width > 0) || !(height > 0)) {
    return { ok: false, reason: 'unreadable' };
  }
  if (a.faceAnnotations !== undefined && !Array.isArray(a.faceAnnotations)) {
    return { ok: false, reason: 'unreadable' };
  }
  const s = a.safeSearchAnnotation;
  if (rank(s.adult) < 0 || rank(s.violence) < 0 || rank(s.racy) < 0 || rank(s.medical) < 0) {
    return { ok: false, reason: 'unreadable' };
  }
  if (
    rank(s.adult) >= rank(PHOTO_RULES.adultAtLeast) ||
    rank(s.violence) >= rank(PHOTO_RULES.violenceAtLeast) ||
    rank(s.medical) >= rank(PHOTO_RULES.medicalAtLeast) ||
    rank(s.racy) >= rank(PHOTO_RULES.racyAtLeast)
  ) {
    return { ok: false, reason: 'unsafe' };
  }
  const frame = width * height;
  for (const f of a.faceAnnotations ?? []) {
    if ((f.detectionConfidence ?? 0) >= PHOTO_RULES.faceConfidence && faceArea(f.boundingPoly?.vertices) / frame >= PHOTO_RULES.faceShareOfFrame) {
      return { ok: false, reason: 'people' };
    }
  }
  return { ok: true };
};
