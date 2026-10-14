import { decideSwapPhoto, PHOTO_RULES, type VisionAnnotation } from '../../supabase/functions/_shared/swapModeration';

const calm = { adult: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY', racy: 'UNLIKELY', medical: 'VERY_UNLIKELY', spoof: 'UNLIKELY' } as const;
const face = (w: number, h: number, confidence = 0.95) => ({
  detectionConfidence: confidence,
  boundingPoly: { vertices: [{ x: 10, y: 10 }, { x: 10 + w, y: 10 }, { x: 10 + w, y: 10 + h }, { x: 10, y: 10 + h }] },
});

const cases: Array<[string, VisionAnnotation | undefined, ReturnType<typeof decideSwapPhoto>]> = [
  ['a flat-lay is fine', { safeSearchAnnotation: calm }, { ok: true }],
  ['adult content, even "possible"', { safeSearchAnnotation: { ...calm, adult: 'POSSIBLE' } }, { ok: false, reason: 'unsafe' }],
  ['violence "likely"', { safeSearchAnnotation: { ...calm, violence: 'LIKELY' } }, { ok: false, reason: 'unsafe' }],
  ['medical "likely"', { safeSearchAnnotation: { ...calm, medical: 'LIKELY' } }, { ok: false, reason: 'unsafe' }],
  ['swimwear is "racy likely" and passes', { safeSearchAnnotation: { ...calm, racy: 'LIKELY' } }, { ok: true }],
  ['racy "very likely"', { safeSearchAnnotation: { ...calm, racy: 'VERY_LIKELY' } }, { ok: false, reason: 'unsafe' }],
  ['a large face', { safeSearchAnnotation: calm, faceAnnotations: [face(300, 300)] }, { ok: false, reason: 'people' }],
  ['a small printed face on a tee', { safeSearchAnnotation: calm, faceAnnotations: [face(30, 30)] }, { ok: true }],
  ['an unsure face detection', { safeSearchAnnotation: calm, faceAnnotations: [face(400, 400, 0.5)] }, { ok: true }],
  ['a Vision error fails closed', { error: { code: 3 } }, { ok: false, reason: 'unreadable' }],
  ['no answer fails closed', undefined, { ok: false, reason: 'unreadable' }],
  ['a missing field fails closed', { safeSearchAnnotation: { adult: 'VERY_UNLIKELY' } }, { ok: false, reason: 'unreadable' }],
  // "UNKNOWN" is Google saying it could not tell. Not telling is not a pass.
  ['UNKNOWN adult fails closed', { safeSearchAnnotation: { ...calm, adult: 'UNKNOWN' } }, { ok: false, reason: 'unreadable' }],
  ['UNKNOWN violence fails closed', { safeSearchAnnotation: { ...calm, violence: 'UNKNOWN' } }, { ok: false, reason: 'unreadable' }],
  ['UNKNOWN racy fails closed', { safeSearchAnnotation: { ...calm, racy: 'UNKNOWN' } }, { ok: false, reason: 'unreadable' }],
  ['UNKNOWN medical fails closed', { safeSearchAnnotation: { ...calm, medical: 'UNKNOWN' } }, { ok: false, reason: 'unreadable' }],
  ['every category UNKNOWN fails closed', { safeSearchAnnotation: { adult: 'UNKNOWN', violence: 'UNKNOWN', racy: 'UNKNOWN', medical: 'UNKNOWN', spoof: 'UNKNOWN' } }, { ok: false, reason: 'unreadable' }],
  ['a word Google does not use fails closed', { safeSearchAnnotation: { ...calm, adult: 'MAYBE' as any } }, { ok: false, reason: 'unreadable' }],
  ['an UNKNOWN spoof score is not judged and does not matter', { safeSearchAnnotation: { ...calm, spoof: 'UNKNOWN' } }, { ok: true }],
  // Vision leaves an empty list out of the answer: no faceAnnotations means no face was found.
  ['no faceAnnotations field means no face was found', { safeSearchAnnotation: calm, faceAnnotations: undefined }, { ok: true }],
  ['an empty list of faces is fine', { safeSearchAnnotation: calm, faceAnnotations: [] }, { ok: true }],
  ['faceAnnotations that is not a list is malformed', { safeSearchAnnotation: calm, faceAnnotations: {} as any }, { ok: false, reason: 'unreadable' }],
  ['a face with no outline counts for nothing', { safeSearchAnnotation: calm, faceAnnotations: [{ detectionConfidence: 0.99 }] }, { ok: true }],
];

describe('decideSwapPhoto', () => {
  it.each(cases)('%s', (_name, annotation, expected) => {
    expect(decideSwapPhoto(annotation, 1000, 1000)).toEqual(expected);
  });

  it('does not trust a photo with no size', () => {
    expect(decideSwapPhoto({ safeSearchAnnotation: calm }, 0, 0)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('keeps the documented thresholds', () => {
    expect(PHOTO_RULES).toEqual({
      adultAtLeast: 'POSSIBLE', violenceAtLeast: 'LIKELY', medicalAtLeast: 'LIKELY', racyAtLeast: 'VERY_LIKELY',
      faceConfidence: 0.8, faceShareOfFrame: 0.04,
    });
  });
});
