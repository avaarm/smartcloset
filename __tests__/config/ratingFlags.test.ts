/**
 * The ratings and tag-scan phases ship dark. The flags are plain constants, so the helpers are checked by
 * running the file's own source with a flag changed (the real constants cannot be reassigned).
 *
 * When the lead switches a phase on at release (a one-line edit to src/config/ratingFlags.ts), the matching
 * line in SHIPPED below changes with it; nothing else here should need touching.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import * as flags from '../../src/config/ratingFlags';

const SHIPPED = {
  TAG_SCAN_ENABLED: true,
  RATINGS_ENABLED: true,
  BRAND_INSIGHTS_ENABLED: false,
  TAG_MODEL_FALLBACK_ENABLED: false,
};

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'config', 'ratingFlags.ts'), 'utf8');

type Loaded = typeof flags;

/** The file's own code, run with some flags set to other values. */
const withFlags = (overrides: Partial<typeof SHIPPED>): Loaded => {
  let code = source;
  for (const [name, value] of Object.entries(overrides)) {
    const pattern = new RegExp(`export const ${name} = (true|false);`);
    expect(code).toMatch(pattern);
    code = code.replace(pattern, `export const ${name} = ${value};`);
  }
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} as Loaded };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', js)(module, module.exports);
  return module.exports;
};

describe('rating flags', () => {
  it('ships tag scanning and private ratings on, and brand insights and the model fallback off', () => {
    expect(flags.TAG_SCAN_ENABLED).toBe(SHIPPED.TAG_SCAN_ENABLED);
    expect(flags.RATINGS_ENABLED).toBe(SHIPPED.RATINGS_ENABLED);
    expect(flags.BRAND_INSIGHTS_ENABLED).toBe(SHIPPED.BRAND_INSIGHTS_ENABLED);
    expect(flags.TAG_MODEL_FALLBACK_ENABLED).toBe(SHIPPED.TAG_MODEL_FALLBACK_ENABLED);
    expect(flags.brandInsightsActive()).toBe(false);
  });

  it('exports exactly the flags and helpers the specification names', () => {
    expect(Object.keys(flags).sort()).toEqual([
      'BRAND_INSIGHTS_ENABLED',
      'RATINGS_ENABLED',
      'TAG_MODEL_FALLBACK_ENABLED',
      'TAG_OCR_FEATURE',
      'TAG_SCAN_ENABLED',
      'brandInsightsActive',
      'ratingsActive',
      'tagScanActive',
    ]);
  });

  it('reads tags with plain text detection', () => {
    expect(flags.TAG_OCR_FEATURE).toBe('TEXT_DETECTION');
  });

  it('answers false from every helper while the flags are off', () => {
    const off = withFlags({ TAG_SCAN_ENABLED: false, RATINGS_ENABLED: false, BRAND_INSIGHTS_ENABLED: false });
    expect(off.brandInsightsActive()).toBe(false);
    expect(off.ratingsActive()).toBe(false);
    expect(off.tagScanActive()).toBe(false);
  });

  it('answers true for the phases that ship on', () => {
    expect(flags.ratingsActive()).toBe(true);
    expect(flags.tagScanActive()).toBe(true);
    expect(flags.brandInsightsActive()).toBe(false);
  });

  it('needs ratings for brand insights', () => {
    expect(withFlags({ RATINGS_ENABLED: false, BRAND_INSIGHTS_ENABLED: true }).brandInsightsActive()).toBe(false);
    expect(withFlags({ RATINGS_ENABLED: true, BRAND_INSIGHTS_ENABLED: false }).brandInsightsActive()).toBe(false);
    expect(withFlags({ RATINGS_ENABLED: true, BRAND_INSIGHTS_ENABLED: true }).brandInsightsActive()).toBe(true);
  });

  it('follows each flag in its own helper', () => {
    expect(withFlags({ RATINGS_ENABLED: true, TAG_SCAN_ENABLED: false }).ratingsActive()).toBe(true);
    expect(withFlags({ RATINGS_ENABLED: true, TAG_SCAN_ENABLED: false }).tagScanActive()).toBe(false);
    expect(withFlags({ TAG_SCAN_ENABLED: true, RATINGS_ENABLED: false }).tagScanActive()).toBe(true);
    expect(withFlags({ TAG_SCAN_ENABLED: true, RATINGS_ENABLED: false }).ratingsActive()).toBe(false);
  });

  it('keeps the flags out of features.ts, whose one-key mocks would leave them undefined', () => {
    const features = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'config', 'features.ts'), 'utf8');
    expect(features).not.toMatch(/TAG_SCAN_ENABLED|RATINGS_ENABLED|BRAND_INSIGHTS_ENABLED|TAG_MODEL_FALLBACK_ENABLED/);
  });
});
