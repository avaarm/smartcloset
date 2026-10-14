/**
 * Each phase ships dark and is switched on after its checks pass. See documentation/design/quality-ratings.md section 2.
 * Tag scanning and private ratings are on for the TestFlight builds so they can be tried on real tags; brand insights
 * (scores shown to other members) and the model fallback stay off. Before an App Store release the tag release gate
 * must pass (run with SMARTCLOSET_RELEASE_GATE=appstore; see __tests__/utils/tagParserCorpus.test.ts).
 */
export const TAG_SCAN_ENABLED = true;
export const RATINGS_ENABLED = true;
export const BRAND_INSIGHTS_ENABLED = false;
export const TAG_MODEL_FALLBACK_ENABLED = false;

/** Which Vision feature reads a tag photo. Switch to DOCUMENT_TEXT_DETECTION only after Spike 0 shows a gain and the proxy allows it (sections 7.13 and 7.14). */
export const TAG_OCR_FEATURE: 'TEXT_DETECTION' | 'DOCUMENT_TEXT_DETECTION' = 'TEXT_DETECTION';

/** Brand insight only makes sense on top of ratings. */
export const brandInsightsActive = (): boolean => RATINGS_ENABLED && BRAND_INSIGHTS_ENABLED;
export const ratingsActive = (): boolean => RATINGS_ENABLED;
export const tagScanActive = (): boolean => TAG_SCAN_ENABLED;
